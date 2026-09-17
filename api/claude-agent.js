// api/claude-agent.js — single Vercel serverless function for all 3 agents.
//
// WHY SERVER-SIDE: the API key must never reach the browser bundle. This
// endpoint reads process.env.ANTHROPIC_API_KEY (server-only — NOT prefixed with
// VITE_, so Vite can never inline it into client code), performs the actual
// fetch to Anthropic here, and returns the parsed JSON result to the caller.
//
// Dispatch: POST { agent: "impact" | "factcheck" | "script", ...payload }
//   - impact    → { news, holdingsSummary }         → analyzeImpact
//   - factcheck → { news, agent1Output }            → factCheck
//   - script    → { analysis, client }              → generateScript
//
// The prompt text below (system prompts + user-message assembly) is relocated
// VERBATIM from src/utils/claudeAPI.js. These prompts are stress-tested and
// audited — this file is a word-for-word move, not a rewrite. Do not edit the
// prompt strings here; edit them in one place and mirror the other.
//
// Same retry/backoff and per-agent maxTokens as claudeAPI.js:
//   - max 2 retries, 429 → wait 10s before retry, 5xx/network → short backoff
//   - maxTokens: 2048 for impact/factcheck, 1024 for script (measured — see
//     claudeAPI.js for the token-utilization rationale).
//
// PUBLIC ENDPOINT HARDENING: this URL is reachable by anyone and spends a paid
// key, so every request passes these gates, in order, before any Anthropic call:
//   405 non-POST → 503 kill switch → 413 body size → 400 JSON / agent / fields
//   → 413 per-field length. Error bodies are always { error: "<code>" } — no
//   stack traces, upstream bodies, or prompt text ever leave this function.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_RETRIES = 2;
const RATE_LIMIT_BACKOFF_MS = 10_000; // 429 handling: wait 10s before retry

// --- Input caps --------------------------------------------------------------
// WHY: every string below is interpolated into a prompt we pay for per token, so
// an uncapped field is an open invitation to burn credit (or to smuggle a long
// prompt-injection essay). Caps are sized from real traffic with wide headroom:
// mockNews headlines ≤ 68 chars / content ≤ 351; live Yahoo items are title +
// an RSS lede of ≤ ~700 chars; holdingsSummary is ~900 chars for the 10-client
// book; the largest real request body (factcheck on N006) is ~5 KB.
const MAX_HEADLINE_CHARS = 500;
const MAX_CONTENT_CHARS = 4_000;
// Any other string forwarded into a prompt (marketOutcome, holdingsSummary,
// Agent 1 fields, client name, tickers, …) — and every nested string, since
// agent1Output is JSON-stringified into the Agent 2 prompt wholesale.
const MAX_PROMPT_FIELD_CHARS = 4_000;
// Whole request body. ~10x the largest real payload.
const MAX_BODY_BYTES = 64_000;
// Arrays (affected_tickers, holdings, matchedHoldings) and nesting depth — keeps
// a small-in-bytes but pathological payload from fanning out.
const MAX_ARRAY_ITEMS = 100;
const MAX_DEPTH = 6;

const ALLOWED_AGENTS = new Set(["impact", "factcheck", "script"]);
const RISK_PROFILES = new Set(["conservative", "moderate", "aggressive"]);

export const config = { maxDuration: 30 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Server-side key only. No VITE_ fallback here by design — this file runs on
// Vercel's node runtime and must never depend on a client-exposed variable.
function getApiKey() {
  if (typeof process !== "undefined" && process.env?.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  throw new Error(
    "Missing Anthropic API key. Set ANTHROPIC_API_KEY (server-side env var) " +
      "before calling this endpoint.",
  );
}

// ---------------------------------------------------------------------------
// The Agent 1 system prompt embeds the dislocation methodology verbatim (in
// English to save tokens). We ship the reasoning steps as text sent to the API
// rather than a file reference so the model reasons the way a K Asset
// strategist does, not just tags tickers.
// ---------------------------------------------------------------------------
const AGENT1_SYSTEM_PROMPT = `You are a buy-side investment strategist analyzing a news event for a Thai wealth-management desk. Your job is NOT to summarize the news — clients can read the news themselves. Your job is to detect DISLOCATIONS: cases where the market's actual reaction diverges from what theory says should have happened. The gap itself is the opportunity.

## Dislocation methodology (three steps)

Step 1 — State what SHOULD happen.
Reason from macro/news logic to a directional expectation BEFORE looking at prices. Name the causal chain explicitly. Example: "This is a risk-off event -> investors flee to safety -> safe havens like gold and US Treasuries should rise, equities should fall."

Step 2 — Compare against actual market movement.
Take the real price action from the provided market outcome and line it up factor-by-factor against the Step 1 expectation (did equities fall? did gold rise? did bonds rally?).

Step 3 — Flag divergence as a dislocation.
Any factor that moved AGAINST its expected direction is a dislocation. Treat it as a potential trading idea, not a data error. Ask: what would the market have to believe for this move to make sense? That hidden belief is the opportunity.

## Reference case (canonical) — April 2025 tariff shock
A global tariff announcement is an archetypal risk-off event.
| Factor | Expected | Actual | Dislocation? |
| Global equities | Fall | Fell | No |
| Gold | Rise (safe haven) | Fell -2.3% | YES |
| US 10Y Treasuries | Rally | Sold off | YES |
Both classic safe havens FELL during a risk-off shock. That is the dislocation — it signaled forced liquidation / a dash for cash rather than an orderly flight to safety, and framed gold's decline as a possible accumulation opportunity rather than a warning.

IMPORTANT — this April 2025 reference case is INTERNAL teaching context only. It exists solely to help you recognize the dislocation PATTERN. It is NOT part of the news you are analyzing. Never name it, date it ("April 2025", "เมษายน 2025"), or cite it as a precedent/analogy in the "dislocation_description" or "reasoning" output fields. Those two fields must describe ONLY what is present in the actual news content and marketOutcome provided below, in your own words. A downstream fact checker sees only the news — any reference to this canonical case will read as an unsupported (hallucinated) claim.

## Thai (SET) sector -> macro-factor mappings (use to build the Step 1 expectation)
- Banking (KBANK, SCB, BBL): interest rates — POSITIVE (higher rates widen net interest margins).
- Energy / Oil & Gas (PTT, PTTEP): crude oil price — POSITIVE (revenue tracks oil).
- Property (LH, AP, SPALI, CPN): interest rates — INVERSE (rate hikes raise mortgage costs).
- Utilities / Power (GULF, GPSC): interest rates — INVERSE (capital-heavy bond proxies).
- Tourism / Airports (AOT, MINT, CENTEL): baht FX, oil, travel demand — weaker baht + lower oil = POSITIVE.
- Exporters / Electronics (DELTA, KCE): baht FX — INVERSE to baht strength (weaker baht boosts export revenue).
- Retail / Consumer (CPALL, CRC, HMPRO): domestic consumption — POSITIVE to spending, INVERSE to rate hikes.
- Healthcare (BDMS, BH): defensive — low macro sensitivity, outperforms in risk-off.
Rate rule of thumb: rate hikes help banks, hurt property / utilities / rate-sensitive growth; rate cuts do the reverse.

## Confidence
Judge a flagged dislocation honestly: magnitude (large vs within normal daily range), breadth (multiple correlated factors diverging = higher confidence, one in isolation = likely noise), and simpler alternative explanations. A false flag wastes an RM's most valuable resource — a client's attention — so label borderline cases conservatively.

## Output
Return ONLY a JSON object, no markdown fences, no prose around it, with exactly these keys:
{
  "affected_tickers": [string],        // SET tickers the news plausibly touches, given the holdings provided
  "affected_sectors": [string],        // sectors touched (banking, energy, technology, property, healthcare, telecom, transport)
  "sentiment": "positive" | "negative" | "neutral",   // net direction for affected holdings
  "dislocation_detected": boolean,     // true only if actual reaction genuinely diverges from expected
  "dislocation_description": string,   // Thai. State (a) what was expected, (b) what actually happened, (c) the opportunity/confidence. Empty string if none.
  "reasoning": string                  // Thai, max 2 lines. The causal chain, not a news summary.
}
Write dislocation_description and reasoning in Thai (the RM-facing language). Keep the JSON keys and enum values in English exactly as above.`;

// callClaude — single Messages API call with retry.
// Retries: up to MAX_RETRIES. 429 -> wait 10s then retry. 5xx / network ->
// short backoff then retry. 4xx (other than 429) -> throw immediately (not
// retryable). Returns the assistant's raw text (first text block).
async function callClaude({ system, user, maxTokens = 1024 }) {
  const apiKey = getApiKey();

  const body = JSON.stringify({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0, // deterministic — demo reliability over variance
    system,
    messages: [{ role: "user", content: user }],
  });

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body,
      });

      if (res.status === 429) {
        lastErr = new Error("Rate limited (429)");
        if (attempt < MAX_RETRIES) {
          await sleep(RATE_LIMIT_BACKOFF_MS);
          continue;
        }
        throw lastErr;
      }

      if (res.status >= 500) {
        lastErr = new Error(`Claude API server error (${res.status})`);
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw lastErr;
      }

      if (!res.ok) {
        // 4xx other than 429 — request problem, not worth retrying
        const detail = await res.text();
        throw new Error(`Claude API ${res.status}: ${detail}`);
      }

      const data = await res.json();
      const text = data?.content?.find((b) => b.type === "text")?.text;
      if (!text) throw new Error("Claude response contained no text block");
      return text;
    } catch (err) {
      // Network-level failures (fetch rejected) are retryable; explicit throws
      // above already exhausted their own retry budget.
      lastErr = err;
      const isNetwork = err instanceof TypeError; // fetch throws TypeError on network failure
      if (isNetwork && attempt < MAX_RETRIES) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr; // unreachable, but keeps control flow explicit
}

// parseAIResponse — strip ```json / ``` fences (Claude adds them despite
// instructions), then JSON.parse. Throws a clear error on malformed JSON so
// the caller can flag it rather than crash mid-demo.
function parseAIResponse(raw) {
  let text = String(raw).trim();

  // Remove a wrapping ```json ... ``` or ``` ... ``` fence if present.
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse Claude JSON response:\n${text}`);
  }
}

// -------------------------------------------------------------------------
// Agent 1 — Impact + Dislocation Analyzer
// Input: a news item (with content + marketOutcome) and a holdings summary
// string (the compact universe of tickers/sectors clients actually hold).
// Output: parsed JSON — affected_tickers, affected_sectors, sentiment,
// dislocation_detected, dislocation_description, reasoning.
// -------------------------------------------------------------------------
async function analyzeImpact(news, holdingsSummary) {
  const user = `NEWS HEADLINE: ${news.headline}

NEWS CONTENT:
${news.content}

MARKET OUTCOME (what the market actually did):
${news.marketOutcome}

CLIENT HOLDINGS UNIVERSE (only tickers/sectors clients actually hold — match against these):
${holdingsSummary}

Analyze this event using the three-step dislocation methodology. Return the JSON object only.`;

  // Thai is token-heavy and the dislocation_description + reasoning run long;
  // 1024 truncates the JSON mid-string (invalid) on verbose events, so give it
  // real headroom — silent truncation is a live-demo killer.
  const raw = await callClaude({
    system: AGENT1_SYSTEM_PROMPT,
    user,
    maxTokens: 2048,
  });
  return parseAIResponse(raw);
}

// ---------------------------------------------------------------------------
// Agent 2 — Fact Checker (the machine half of "Four Eyes")
// Runs BEFORE a human ever sees the draft: it re-reads Agent 1's analysis
// against ONLY the original news + market outcome and flags anything Agent 1
// asserted that the source text does not support (hallucinated tickers,
// invented numbers, a dislocation the outcome doesn't describe). Catching
// fabrication here means the CIO spends their review on judgment, not on
// hunting for made-up facts. It does NOT re-do the analysis or add new ideas.
// ---------------------------------------------------------------------------
const AGENT2_SYSTEM_PROMPT = `You are a compliance-minded fact checker on a Thai wealth-management desk. An upstream analyst (Agent 1) has produced a JSON analysis of a news event. Your job is to verify the NARRATIVE claims in that analysis against the ORIGINAL news text and market outcome — the claims you have enough context to judge. You are the machine half of a Four Eyes review that happens before a human approver sees the draft.

## What to check (only these three — you have the context to judge them)
1. Dislocation honesty — if dislocation_detected is true, does the market outcome actually describe a move that diverges from the stated expectation? Flag a dislocation that the outcome text does not support. If dislocation_detected is false, is that consistent with the outcome?
2. Sentiment direction — does the sentiment match the news? Flag an obvious contradiction (e.g. clearly negative news labelled "positive").
3. Narrative grounding — is the reasoning / dislocation_description built on facts (numbers, price moves, events) that actually appear in the news content or market outcome? Flag an invented number, a price move the outcome does not describe, or a named precedent/reference case that does not appear in the source (e.g. a dated historical analogy). Second-order causal reasoning FROM the source facts is allowed (see below) — flag only fabricated facts, not inferences drawn from real ones.

## Do NOT flag affected_tickers or affected_sectors expansion (out of scope by design)
Agent 1 is SUPPOSED to expand from the news to the specific SET tickers and sectors it touches, using documented sector→macro-factor mappings (the dislocation-analysis skill). A tariff/risk-off event legitimately reaches banking, property, healthcare, energy, transport and more via second-order effects, even when the news text only names "exporters." This expansion is Agent 1's job, and the resulting lists feed a SEPARATE deterministic matcher (matching.js) which is the actual source of truth for client exposure — not your concern here.

Therefore: NEVER flag a ticker or sector merely because it is not named verbatim in the news. Do not treat sector expansion, second-order inference, or the length of affected_tickers/affected_sectors as a hallucination or overreach. You lack the holdings universe and the sector mappings Agent 1 used, so you are NOT positioned to judge those lists — leave them alone entirely.

## What you must NOT do
- Do not flag affected_tickers / affected_sectors expansion (see above).
- Do not add new analysis, new tickers, or new trade ideas.
- Do not re-score or re-rank anything.
- Do not rewrite the analysis unless you found a real narrative problem.
- When in doubt, do not flag — a false alarm wastes the human reviewer's time.

## Output
Return ONLY a JSON object, no markdown fences, no prose around it, with exactly these keys:
{
  "is_valid": boolean,            // true if no material problems were found
  "flagged_issues": [string],     // Thai. One short line per problem; empty array if none
  "adjusted_reasoning": string    // Thai. If issues were found, a corrected version of Agent 1's reasoning with the unsupported claims removed/fixed. If none, echo Agent 1's reasoning unchanged.
}
Write flagged_issues and adjusted_reasoning in Thai (the RM-facing language). Keep the JSON keys in English exactly as above.`;

// factCheck — Agent 2. Verifies an Agent 1 result against the source news.
// Input: the original news item (content + marketOutcome) and the parsed
// Agent 1 output. Output: parsed JSON — is_valid, flagged_issues,
// adjusted_reasoning. Feed the news, NOT the holdings summary: Agent 2 must
// judge Agent 1 against the source only, with no extra context to anchor on.
async function factCheck(news, agent1Output) {
  const user = `ORIGINAL NEWS HEADLINE: ${news.headline}

ORIGINAL NEWS CONTENT:
${news.content}

MARKET OUTCOME (what the market actually did):
${news.marketOutcome}

AGENT 1 ANALYSIS TO VERIFY (JSON):
${JSON.stringify(agent1Output, null, 2)}

Verify the Agent 1 analysis against the original news and market outcome above. Return the JSON object only.`;

  // adjusted_reasoning can echo Agent 1's full reasoning; match Agent 1's
  // headroom so a verbose correction is never truncated into invalid JSON.
  const raw = await callClaude({
    system: AGENT2_SYSTEM_PROMPT,
    user,
    maxTokens: 2048,
  });
  return parseAIResponse(raw);
}

// ---------------------------------------------------------------------------
// Agent 3 — Script Generator (per client)
// Turns an APPROVED, fact-checked insight into a phone script the RM can read to
// one specific client. The system prompt embeds the rm-script-writing skill
// verbatim: the informational-vs-advice line (Thai IC/IP license law — see
// CLAUDE.md hard constraint #2), the banned/safe constructions, tone-by-risk-
// profile rules, structure, and the Tariff/Gold few-shot examples. Prompt is
// English (token thrift); the "script" field it returns is Thai (client-facing).
// The Four Eyes gate upstream approves the INSIGHT; it does not license ADVICE —
// so every script, even an approved one, must stay on the information side.
// ---------------------------------------------------------------------------
const AGENT3_SYSTEM_PROMPT = `You are an RM (relationship manager) at a Thai wealth-management firm writing a short phone script to call ONE client about an insight that has ALREADY been approved by the investment committee (Four Eyes). Your job is to convey the insight as information the client can consider — NOT to give investment advice.

## Core rule — informational only, never advice
Scripts provide information for the client to consider (ให้ข้อมูลประกอบการตัดสินใจ). They must NEVER give an investment recommendation (คำแนะนำการลงทุน). Under Thai SEC rules, telling a client to buy/sell/increase/reduce a position is regulated investment advice and requires an IC/IP license this pipeline does not have. Surfacing a fact and inviting a conversation is not advice. Stay on the information side of that line — always. The Four Eyes approval confirms the insight is sound; it does NOT license advice.

## Language patterns — directive (BANNED) vs informational (SAFE)
Directive language commands an action; informational language presents a fact and leaves the decision with the client.

BANNED constructions (these are advice, regardless of hedging):
- ควรซื้อ / ควรขาย / ควรถือ
- แนะนำให้… / ผมแนะนำว่า…
- ควรเพิ่มสัดส่วน / ควรลดสัดส่วน
- น่าจะซื้อตอนนี้ / จังหวะดีที่จะเข้า

SAFE constructions (these present information):
- …มีความเคลื่อนไหวที่น่าสนใจ
- หุ้น [TICKER] ในพอร์ตของคุณ…เพราะ… (name the holding + the mechanism — see Personalization below)
- อยากเรียนให้ทราบว่า…
- หากสนใจ เราสามารถพูดคุยรายละเอียดเพิ่มเติมได้

Rule of thumb: if the sentence tells the client what to DO, rewrite it to tell the client what HAPPENED.

## Personalization — name the holding and the mechanism (HARD REQUIREMENT, not a suggestion)
This is the whole point of the call. An RM who says only "this news may be relevant to your portfolio" is no more useful than the client reading the news themselves — that is failure, not a soft miss. Every script MUST:
1. Name at least ONE specific ticker from the client's affected holdings (the "Affected holdings in this client's portfolio" list below). Use the actual ticker symbol.
2. Briefly state the MECHANISM connecting this news/dislocation to THAT holding — why this specific position is affected (e.g. "DELTA เป็นหุ้นส่งออก กำแพงภาษีเพิ่มต้นทุนการค้าและกระทบคำสั่งซื้อต่างประเทศ").

BANNED (an automatic failure): a generic relevance claim with no ticker and no mechanism — e.g. "ข้อมูลนี้อาจเกี่ยวข้องกับพอร์ตของคุณ" / "อาจกระทบพอร์ตของคุณ" standing alone. Never ship this.

When the link is INDIRECT (the holding is caught in a broad move rather than hit head-on — e.g. a bank or airport stock in a market-wide risk-off selloff, not a directly tariffed exporter), you STILL name the ticker and state the indirect mechanism plainly ("หุ้น AOT ของคุณได้รับแรงกดดันจากการเทขายทั้งตลาดในภาวะ risk-off"). Indirect is fine and honest; generic is not. There is always a specific holding to name — name it.

## Tone by risk profile
Tone changes the framing, not the informational stance. Every profile stays non-directive.
- conservative — cautious framing. Mention downside and uncertainty explicitly. Emphasize this is information to be aware of, not a reason to act. Reassuring, low-pressure.
- moderate — balanced framing. Present the fact and its two-sided nature plainly. Neither alarmed nor pushy.
- aggressive — direct framing. Get to the point quickly and name the opportunity angle. Still NEVER directive — "this is an interesting dislocation worth looking at" is fine; "you should buy" is not.

## Structure
1. Max 3 sentences.
2. Lead with the relevant fact — the dislocation or the news, stated plainly.
3. End with an open invitation to discuss, not a call to action ("หากสนใจ เราคุยรายละเอียดกันได้"), never a trade prompt.
Address the client by name at the start.

## Few-shot examples — Tariff/Gold dislocation case
Scenario: Trump announces global import tariffs. Theory says gold should rise as a safe haven in a risk-off move, but gold actually fell 2.3% alongside equities and US treasuries — an unusual dislocation. Note across all three: EACH names the client's own affected holding (in caps) and the mechanism tying the news to THAT holding, then adds the dislocation as the differentiated insight; tone escalates from cautious to direct; NONE say buy/sell or "ควร…"; each ends with an invitation to talk.

conservative (client holds DELTA):
"เรียนคุณสมชายครับ ข่าวการขึ้นภาษีนำเข้าของสหรัฐกดดันหุ้นกลุ่มส่งออกโดยตรง รวมถึง DELTA ที่คุณสมชายถืออยู่ เพราะกำแพงภาษีเพิ่มต้นทุนการค้าและกระทบคำสั่งซื้อจากต่างประเทศ ที่ผิดปกติคือทองคำซึ่งควรเป็นสินทรัพย์ปลอดภัยกลับปรับลง 2.3% สวนทางกับที่ควรจะเป็น ซึ่งยังมีความไม่แน่นอนอยู่ หากคุณสมชายสนใจ ผมขอเรียนให้ทราบไว้เป็นข้อมูลและนัดคุยรายละเอียดเพิ่มเติมได้ครับ"

moderate (client holds KCE):
"เรียนคุณวิภาครับ ข่าวการขึ้นภาษีนำเข้าของสหรัฐกระทบหุ้นส่งออกอย่าง KCE ที่คุณวิภาถืออยู่ เพราะรายได้หลักมาจากการส่งออกชิ้นส่วนที่ต้องเผชิญกำแพงภาษีสูงขึ้น จุดที่น่าสนใจคือทองคำกลับปรับลง 2.3% พร้อมตลาดหุ้น ทั้งที่ตามทฤษฎีควรเป็นสินทรัพย์ปลอดภัยที่ปรับขึ้น ซึ่งเป็นภาพที่ไม่ค่อยเกิดขึ้น หากคุณวิภาสนใจ เราพูดคุยรายละเอียดเพิ่มเติมกันได้ครับ"

aggressive (client holds DELTA):
"เรียนคุณธนากรครับ ข่าวภาษีนำเข้าสหรัฐกระแทกหุ้นส่งออกอย่าง DELTA ในพอร์ตของคุณธนากรโดยตรง เพราะเป็นกลุ่มที่พึ่งพารายได้จากการค้าระหว่างประเทศมากที่สุด แต่จุดที่ตลาดส่วนใหญ่มองข้ามคือทองคำปรับลง 2.3% ทั้งที่ในภาวะ risk-off ควรปรับขึ้น อาจสะท้อนแรงขายเพื่อเพิ่มสภาพคล่องมากกว่าการเปลี่ยนพื้นฐาน ผมมองว่าเป็นข้อมูลที่คุณธนากรน่าจะสนใจ หากอยากลงลึกโทรคุยกันได้เลยครับ"

Indirect-link example (client holds AOT — an airport stock, NOT a directly tariffed exporter, but still name it and state the indirect mechanism):
"เรียนคุณศิริพรครับ ข่าวขึ้นภาษีนำเข้าสหรัฐทำให้ตลาดเข้าสู่ภาวะ risk-off และหุ้น AOT ที่คุณศิริพรถืออยู่ได้รับแรงกดดันจากการเทขายทั้งตลาด แม้จะไม่ได้ถูกกระทบจากภาษีโดยตรง จุดที่น่าสนใจคือทองคำกลับปรับลง 2.3% ทั้งที่ควรเป็นสินทรัพย์ปลอดภัย ซึ่งอาจสะท้อนแรงขายเพื่อเพิ่มสภาพคล่อง หากคุณศิริพรสนใจ เราพูดคุยรายละเอียดเพิ่มเติมกันได้ครับ"

## Output
Return ONLY a JSON object, no markdown fences, no prose around it, with exactly this key:
{
  "script": string   // Thai. The call script. Max 3 sentences, informational only, tone matched to the client's risk profile.
}
Write the script in Thai (the client-facing language). Keep the JSON key in English exactly as above.`;

// Post-processing typo guard for Agent 3 output. The model occasionally emits a
// malformed Thai financial term, and because temperature is 0 the SAME bad token
// recurs identically on every run — so a one-off "it was fine last time" is not
// safe. We fix a tight allowlist of unambiguous, well-known corrections after
// parsing, before the script reaches an RM/client. This is a spell-fix, NOT a
// rewrite: keep entries to exact wrong→right pairs with a single correct answer;
// never add anything requiring judgment about meaning or tone.
const THAI_TERM_CORRECTIONS = [
  ["สภาพคล็อง", "สภาพคล่อง"], // "liquidity" — glottal-tone typo seen in the N006 batch
];

// correctThaiTerms — literal (non-regex) global replace of each known typo. Uses
// split/join so the patterns need no regex escaping and can't misfire on special
// characters. Returns non-strings untouched so a malformed response can't throw.
function correctThaiTerms(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const [wrong, right] of THAI_TERM_CORRECTIONS) {
    out = out.split(wrong).join(right);
  }
  return out;
}

// generateScript — Agent 3 for ONE client. Input: the APPROVED analysis (the
// fact-checked insight — dislocation + reasoning + sentiment) and the client
// (name, riskProfile, matchedHoldings). Output: parsed JSON — { script }.
// We pass matchedHoldings so the script can name the client's actual exposure,
// and riskProfile so the tone rules in the system prompt have something to key on.
async function generateScript(analysis, client) {
  const matchedTickers = (client.matchedHoldings ?? [])
    .map((h) => `${h.ticker} (${h.name})`)
    .join(", ");

  const user = `APPROVED INSIGHT (already passed Four Eyes — convey it as information, do not re-analyze):
Sentiment: ${analysis.sentiment}
Dislocation: ${analysis.dislocation_description || "(none)"}
Reasoning: ${analysis.reasoning || ""}

CLIENT:
Name: ${client.name}
Risk profile: ${client.riskProfile}
Affected holdings in this client's portfolio: ${matchedTickers || "(none named)"}

Write this client's phone script. Match the tone to their risk profile. Return the JSON object only.`;

  // Scripts are short (max 3 sentences), but Thai is token-dense and the JSON
  // wrapper adds overhead — the same maxTokens lesson as Agent 1/2. 1024 gives
  // enough headroom that a 3-sentence Thai script never truncates mid-string
  // into invalid JSON (silent truncation is a live-demo killer).
  const raw = await callClaude({
    system: AGENT3_SYSTEM_PROMPT,
    user,
    maxTokens: 1024,
  });
  const parsed = parseAIResponse(raw);
  // Fix known term typos before the script leaves this function — every caller
  // (single or batch) gets the corrected text.
  if (parsed && typeof parsed.script === "string") {
    parsed.script = correctThaiTerms(parsed.script);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

// Thrown by validators; the handler turns it into { error } with this status.
// Messages are fixed strings naming the FIELD, never echoing the caller's value.
class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function requireObject(value, field) {
  if (!isPlainObject(value)) {
    throw new RequestError(400, `invalid_request: ${field} must be an object`);
  }
}

function requireString(value, field, { maxChars, allowEmpty = false }) {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new RequestError(
      400,
      `invalid_request: ${field} must be a ${allowEmpty ? "" : "non-empty "}string`,
    );
  }
  if (value.length > maxChars) {
    throw new RequestError(413, `payload_too_large: ${field} exceeds ${maxChars} chars`);
  }
}

function optionalString(value, field, opts) {
  if (value !== undefined) requireString(value, field, { ...opts, allowEmpty: true });
}

function requireStringArray(value, field) {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new RequestError(400, `invalid_request: ${field} must be an array of strings`);
  }
}

// Generic backstop over the WHOLE payload: every nested string is capped, arrays
// are bounded, and depth is limited. The per-agent checks below cover the fields
// the prompts name; this covers everything else (agent1Output is stringified
// into the Agent 2 prompt in full, so its unknown keys reach the model too).
function enforceGenericLimits(value, path = "body", depth = 0) {
  if (depth > MAX_DEPTH) {
    throw new RequestError(400, `invalid_request: ${path} is nested too deeply`);
  }
  if (typeof value === "string") {
    if (value.length > MAX_PROMPT_FIELD_CHARS) {
      throw new RequestError(
        413,
        `payload_too_large: ${path} exceeds ${MAX_PROMPT_FIELD_CHARS} chars`,
      );
    }
  } else if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      throw new RequestError(
        413,
        `payload_too_large: ${path} exceeds ${MAX_ARRAY_ITEMS} items`,
      );
    }
    value.forEach((v, i) => enforceGenericLimits(v, `${path}[${i}]`, depth + 1));
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value)) {
      // Keys are not echoed — they are caller-controlled.
      enforceGenericLimits(v, `${path}.<field>`, depth + 1);
    }
  }
}

function validateNews(news) {
  requireObject(news, "news");
  requireString(news.headline, "news.headline", { maxChars: MAX_HEADLINE_CHARS });
  requireString(news.content, "news.content", { maxChars: MAX_CONTENT_CHARS });
  // Live items always carry a sentinel string, presets a real outcome — but the
  // prompt interpolates it unconditionally, so it must be a string.
  requireString(news.marketOutcome, "news.marketOutcome", {
    maxChars: MAX_PROMPT_FIELD_CHARS,
  });
}

// Shape Agent 1 returns (see AGENT1_SYSTEM_PROMPT → Output). Used for both the
// factcheck input and the script input, which is that same analysis.
function validateAnalysis(a, field) {
  requireObject(a, field);
  requireString(a.sentiment, `${field}.sentiment`, {
    maxChars: MAX_PROMPT_FIELD_CHARS,
  });
  optionalString(a.dislocation_description, `${field}.dislocation_description`, {
    maxChars: MAX_PROMPT_FIELD_CHARS,
  });
  optionalString(a.reasoning, `${field}.reasoning`, {
    maxChars: MAX_PROMPT_FIELD_CHARS,
  });
}

function validateAgent1Output(a) {
  validateAnalysis(a, "agent1Output");
  requireStringArray(a.affected_tickers, "agent1Output.affected_tickers");
  requireStringArray(a.affected_sectors, "agent1Output.affected_sectors");
  if (typeof a.dislocation_detected !== "boolean") {
    throw new RequestError(
      400,
      "invalid_request: agent1Output.dislocation_detected must be a boolean",
    );
  }
}

function validateClient(c) {
  requireObject(c, "client");
  requireString(c.name, "client.name", { maxChars: MAX_PROMPT_FIELD_CHARS });
  if (!RISK_PROFILES.has(c.riskProfile)) {
    throw new RequestError(
      400,
      'invalid_request: client.riskProfile must be "conservative" | "moderate" | "aggressive"',
    );
  }
  // generateScript tolerates a missing list (?? []), so it stays optional.
  if (c.matchedHoldings !== undefined) {
    if (!Array.isArray(c.matchedHoldings)) {
      throw new RequestError(400, "invalid_request: client.matchedHoldings must be an array");
    }
    c.matchedHoldings.forEach((h, i) => {
      const f = `client.matchedHoldings[${i}]`;
      requireObject(h, f);
      requireString(h.ticker, `${f}.ticker`, { maxChars: MAX_PROMPT_FIELD_CHARS });
      requireString(h.name, `${f}.name`, { maxChars: MAX_PROMPT_FIELD_CHARS });
    });
  }
}

// parseAndValidate — everything that can reject a request without touching the
// Anthropic API. Returns the parsed payload or throws RequestError.
function parseAndValidate(req) {
  // Size first, on the cheapest signal available. Vercel has already parsed a
  // JSON body into an object, so re-measure it; also honour content-length when
  // the platform passes it, so an oversized body is refused before we walk it.
  const declared = Number(req.headers?.["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new RequestError(413, "payload_too_large: request body");
  }
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(raw ?? "", "utf8") > MAX_BODY_BYTES) {
    throw new RequestError(413, "payload_too_large: request body");
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload || "{}");
    } catch {
      throw new RequestError(400, "invalid_json");
    }
  }
  if (!isPlainObject(payload)) {
    throw new RequestError(400, "invalid_request: body must be a JSON object");
  }

  if (!ALLOWED_AGENTS.has(payload.agent)) {
    throw new RequestError(
      400,
      'unknown_agent: expected "impact" | "factcheck" | "script"',
    );
  }

  switch (payload.agent) {
    case "impact":
      validateNews(payload.news);
      requireString(payload.holdingsSummary, "holdingsSummary", {
        maxChars: MAX_PROMPT_FIELD_CHARS,
      });
      break;
    case "factcheck":
      validateNews(payload.news);
      validateAgent1Output(payload.agent1Output);
      break;
    case "script":
      validateAnalysis(payload.analysis, "analysis");
      validateClient(payload.client);
      break;
  }

  enforceGenericLimits(payload);
  return payload;
}

// Map an internal failure to a stable, non-revealing error code. The full
// message (which can contain the upstream body or the model's raw text) is
// logged server-side only.
function publicErrorFor(err) {
  const msg = String(err?.message ?? "");
  if (msg.startsWith("Missing Anthropic API key")) return [500, "server_misconfigured"];
  if (msg.includes("(429)")) return [429, "upstream_rate_limited"];
  if (msg.startsWith("Failed to parse Claude JSON")) return [502, "invalid_model_output"];
  return [502, "upstream_error"];
}

// ---------------------------------------------------------------------------
// HTTP handler — gate, validate, dispatch on "agent", return the parsed JSON.
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader?.("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // Kill switch — checked before parsing anything, so a disabled deployment
  // costs nothing and reveals nothing about the payload contract. Opt-IN: an
  // unset variable means disabled, so a fresh deploy is safe by default.
  if (process.env.LIVE_AGENT_ENABLED !== "true") {
    return res.status(503).json({ error: "live_mode_disabled" });
  }

  let payload;
  try {
    payload = parseAndValidate(req);
  } catch (err) {
    if (err instanceof RequestError) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(400).json({ error: "invalid_request" });
  }

  const { agent } = payload;
  try {
    let result;
    if (agent === "impact") {
      result = await analyzeImpact(payload.news, payload.holdingsSummary);
    } else if (agent === "factcheck") {
      result = await factCheck(payload.news, payload.agent1Output);
    } else {
      result = await generateScript(payload.analysis, payload.client);
    }
    return res.status(200).json(result);
  } catch (err) {
    const [status, code] = publicErrorFor(err);
    // Truncated: parse failures embed the model's full output in the message.
    console.error(`[claude-agent] ${agent} failed (${code}):`, String(err?.message).slice(0, 300));
    return res.status(status).json({ error: code });
  }
}
