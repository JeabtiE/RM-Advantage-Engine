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
// This file is the ONLY home of the prompt text (system prompts + user-message
// assembly); claudeAPI.js is a thin transport. The prompts are stress-tested —
// after editing one, re-check the cached scenarios' gates (regen script) before
// regenerating the demo cache.
//
// Agent 1 output is normalized after parsing (normalizeAgent1Output) so
// event_scope / sector_impacts / affected_sectors are mutually consistent before
// matching.js sees them; every adjustment is listed in normalization_notes.
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
const MATCHED_BY = new Set(["ticker", "sector"]);

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
// SECTOR_MECHANISM_TABLE — the ONE definition of each sector's macro driver and
// characteristics. Injected verbatim into BOTH the Agent 1 prompt (to build
// expectations and sector reasons) and the Agent 2 prompt (to judge those
// reasons), so the two agents can never disagree about, say, which sectors are
// bond proxies. The N007 regen failed exactly that way: Agent 1 called telecom a
// bond proxy (per its table) while Agent 2 used a different taxonomy.
// skills/dislocation-analysis/SKILL.md §4 carries this exact text; a test keeps
// them in sync.
// ---------------------------------------------------------------------------
export const SECTOR_MECHANISM_TABLE = `- Banking (KBANK, SCB, BBL): interest rates — POSITIVE (higher rates widen net interest margins).
- Energy / Oil & Gas (PTT, PTTEP): crude oil price — POSITIVE (revenue tracks oil).
- Property (LH, AP, SPALI, CPN): interest rates — INVERSE (rate hikes raise mortgage costs).
- Utilities / Power (GULF, GPSC): interest rates — INVERSE (bond proxy: capital-heavy, stable cash flows).
- Telecom (ADVANC, TRUE, INTUCH): interest rates — INVERSE (bond proxy: stable cash flows, high dividends, high leverage).
- Tourism / Airports (AOT, MINT, CENTEL): baht FX, oil, travel demand — weaker baht + lower oil = POSITIVE.
- Exporters / Electronics (DELTA, KCE): baht FX — INVERSE to baht strength (weaker baht boosts export revenue).
- Retail / Consumer (CPALL, CRC, HMPRO): domestic consumption — POSITIVE to spending, INVERSE to rate hikes.
- Healthcare (BDMS, BH): defensive — low macro sensitivity, outperforms in risk-off.
Bond proxies are ONLY the sectors labelled "bond proxy" above (utilities/power and telecom). Transport and property are rate-sensitive for other reasons (debt-funded infrastructure, mortgage costs) and are not bond proxies.
Rate rule of thumb: rate hikes help banks, hurt property / utilities / telecom / rate-sensitive growth; rate cuts do the reverse.`;

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
${SECTOR_MECHANISM_TABLE}

## Confidence
Judge a flagged dislocation honestly: magnitude (large vs within normal daily range), breadth (multiple correlated factors diverging = higher confidence, one in isolation = likely noise), and simpler alternative explanations. A false flag wastes an RM's most valuable resource — a client's attention — so label borderline cases conservatively.

## Event scope — how far to expand (decide this FIRST)
Classify the event before choosing tickers and sectors. The scope controls how wide the client list becomes: downstream, "single_company" matches clients by ticker only, so a mis-scoped event either spams unrelated clients or misses exposed ones.
- "single_company" — the news is about one named company (earnings, a deal, a contract, a management change). Do NOT expand to the rest of its sector: other companies in the same industry are not affected by this company's deal. affected_tickers must contain that company's ticker if it is in the holdings universe.
  Example: "Supalai reports record quarterly presales" -> single_company, affected_tickers ["SPALI"].
- "sector" — the news is about one industry as a whole (an industry-wide regulation, sector demand data, an industry price change). List that sector; do NOT expand to second-order sectors.
  Example: "Regulator cuts mobile spectrum licence fees for all operators" -> sector, affected_sectors ["telecom"].
- "systemic" — macro or market-wide news (interest rates, tariffs, FX, oil shocks, risk-off). Second-order expansion to other sectors IS allowed, using the sector mappings above, and every expanded sector must be justified by the causal chain in "reasoning".
  Example: "The baht falls 4% in a week" -> systemic; technology (exporters) positive, transport (fuel/import costs) negative.

## Ticker discipline for "systemic" and "sector" events
affected_tickers is NOT a list of every holding in the affected sectors. For "systemic" and "sector" events, include a ticker ONLY if (a) the company is named in the news or market outcome, or (b) your reasoning states a specific, company-level exposure (something true of that company and not of its sector peers). Sector-wide exposure belongs in affected_sectors and sector_impacts — the downstream matcher already reaches every client holding that sector. An empty affected_tickers list is correct for most macro events.

## Sector impacts — direction per sector
For every sector you list, state which way THIS event pushes it. Mixed-direction events are normal and expected: a rate hike is positive for banking and negative for property at the same time.

## Top-level sentiment — what it means
"sentiment" is the EXPECTED (theoretical) net impact of this news on the held sectors you list, judged BEFORE any market reaction — the Step 1 expectation, not the observed move. It must be consistent with sector_impacts: mostly negative directions -> "negative", mostly positive -> "positive", balanced or unclear -> "neutral". It never overrides a per-sector direction. The actual market reaction does NOT change sentiment; if the market moved differently from this expectation, that belongs ONLY in dislocation_detected / dislocation_description.
Sector values in affected_sectors and sector_impacts must be EXACTLY the sector names that appear in the client holdings universe (the last item inside each parenthesis, e.g. "banking"), lowercase. Do not invent sectors. Every sector in sector_impacts must also appear in affected_sectors.
Every sector_impacts entry needs a "reason": ONE short Thai sentence giving the mechanism that links this news to that sector's direction. Use only facts that appear in the news content or market outcome, plus general economic mechanisms (e.g. "ดอกเบี้ยที่สูงขึ้นเพิ่มต้นทุนการกู้ยืม"). Do not introduce figures, events or company facts that are not in the source, and use a mechanism that genuinely fits that sector (per the mappings above).

## Output
Return ONLY a JSON object, no markdown fences, no prose around it, with exactly these keys:
{
  "affected_tickers": [string],        // held SET tickers with company-level exposure only (see ticker discipline above)
  "affected_sectors": [string],        // held sectors touched, per event_scope (see above)
  "sentiment": "positive" | "negative" | "neutral",   // expected (theoretical) net impact on the listed sectors, before market reaction; consistent with sector_impacts
  "event_scope": "systemic" | "sector" | "single_company",
  "sector_impacts": [ { "sector": string, "direction": "positive" | "negative" | "neutral", "reason": string } ],   // one entry per affected sector; reason = one short Thai sentence (see above)
  "dislocation_detected": boolean,     // true only if actual reaction genuinely diverges from expected
  "dislocation_description": string,   // Thai. State (a) what was expected, (b) what actually happened, (c) the opportunity/confidence. Empty string if none.
  "reasoning": string                  // Thai, max 2 lines. The causal chain, not a news summary. For systemic events, it must justify the sectors you expanded to.
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
    // 0 for all three agents. For Agent 1/2 this REDUCES run-to-run flips in
    // per-sector direction (e.g. N006 healthcare positive vs neutral, which
    // changes the client ranking) but does not eliminate them — the same input
    // can still return a different classification.
    temperature: 0,
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
  const parsed = parseAIResponse(raw);
  // Ticker discipline (only named / company-specific tickers on systemic and
  // sector news) is prompt guidance ONLY — deliberately no server-side cap. A
  // count cap cannot tell a sector sweep from a legitimately named list (a news
  // item naming five banks), so it would silently drop a company the news is
  // actually about and quietly remove its holders from the call list. Over-long
  // lists are visible to the CIO; a silent drop is not.
  //
  // normalization_notes is OURS, not the model's: a model-authored note would be
  // shown to the CIO as if the server had written it.
  if (parsed && typeof parsed === "object") delete parsed.normalization_notes;
  return normalizeAgent1Output(
    parsed,
    heldSectorsFromSummary(holdingsSummary),
    heldTickersFromSummary(holdingsSummary),
  );
}

// ---------------------------------------------------------------------------
// Agent 1 post-parse normalization (deterministic, NO AI)
//
// Agent 1's event_scope / sector_impacts feed matching.js, which decides sector
// matches from affected_sectors ONLY. A sector the model lists in sector_impacts
// but forgets in affected_sectors would silently drop its clients off the call
// list — so consistency is enforced here, in code, rather than trusted to the
// prompt. Every change is recorded in normalization_notes (Thai, shown to the
// CIO in the Four Eyes view) so nothing is adjusted silently.
// ---------------------------------------------------------------------------

const DIRECTIONS = new Set(["positive", "negative", "neutral"]);
const EVENT_SCOPES = new Set(["systemic", "sector", "single_company"]);

const normSector = (s) => String(s).trim().toLowerCase();

// heldSectorsFromSummary — the held-sector set Agent 1 was shown. Each summary
// line is "TICKER (name, sector)"; names can themselves contain parentheses and
// commas ("AP (เอพี (ไทยแลนด์), property)"), so take the text after the LAST
// comma before the closing parenthesis. Using the summary (not a server-side
// import of the client book) keeps "allowed sectors" identical to what the
// prompt listed.
export function heldSectorsFromSummary(holdingsSummary) {
  const sectors = new Set();
  for (const line of String(holdingsSummary ?? "").split("\n")) {
    const m = line.match(/,\s*([^,()]+?)\s*\)\s*$/);
    if (m) sectors.add(normSector(m[1]));
  }
  return sectors;
}

// heldTickersFromSummary — the ticker at the start of each summary line
// ("TICKER (name, sector)"), uppercased.
export function heldTickersFromSummary(holdingsSummary) {
  const tickers = new Set();
  for (const line of String(holdingsSummary ?? "").split("\n")) {
    const m = line.match(/^\s*([^\s(]+)\s*\(/);
    if (m) tickers.add(m[1].toUpperCase());
  }
  return tickers;
}

// One short Thai sentence per sector; the cap keeps a runaway reason from
// bloating the CIO view and the Agent 2 / Agent 3 prompts it is forwarded into.
export const MAX_SECTOR_REASON_CHARS = 300;

// normalizeAgent1Output — pure; returns a new object, never mutates the input.
// Idempotent: running it on its own output changes nothing and adds no notes
// (existing notes are carried forward, not regenerated; notes about a condition
// that persists after normalization are added only once).
//
// @param {object} output                 parsed Agent 1 JSON
// @param {Iterable<string>} heldSectors  sectors the client book actually holds
// @param {Iterable<string>} [heldTickers] tickers the book holds; when omitted,
//                                        only an EMPTY single_company ticker list is noted
export function normalizeAgent1Output(output, heldSectors, heldTickers) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const held = new Set([...(heldSectors ?? [])].map(normSector));
  const out = { ...output };
  const notes = Array.isArray(output.normalization_notes)
    ? output.normalization_notes.filter((n) => typeof n === "string")
    : [];
  const noteOnce = (n) => {
    if (!notes.includes(n)) notes.push(n);
  };

  // A non-list here would make matching.js throw on .map — replace with [].
  for (const key of ["affected_tickers", "affected_sectors"]) {
    if (out[key] !== undefined && !Array.isArray(out[key])) {
      out[key] = [];
      notes.push(`${key} ไม่ใช่รายการ (array) — ตั้งเป็นรายการว่าง`);
    }
  }

  // affected_sectors: lowercase/trim, drop exact duplicates. A distinct sector
  // is never removed — even one outside the book; matching simply won't hit it —
  // with ONE exception below: a sector explicitly tagged neutral.
  if (Array.isArray(out.affected_sectors)) {
    const before = out.affected_sectors;
    const cleaned = [...new Set(before.filter((s) => typeof s === "string").map(normSector))].filter(Boolean);
    if (JSON.stringify(cleaned) !== JSON.stringify(before)) {
      notes.push("ปรับรูปแบบ affected_sectors เป็นตัวพิมพ์เล็กและตัดรายการซ้ำ");
    }
    out.affected_sectors = cleaned;
  }

  // sector_impacts: keep only well-formed entries for held sectors.
  if (out.sector_impacts !== undefined) {
    if (!Array.isArray(out.sector_impacts)) {
      delete out.sector_impacts;
      notes.push("ลบ sector_impacts เนื่องจากรูปแบบไม่ถูกต้อง (ไม่ใช่ array)");
    } else {
      const seen = new Set();
      const kept = [];
      for (const entry of out.sector_impacts) {
        if (!entry || typeof entry !== "object" || typeof entry.sector !== "string" || !entry.sector.trim()) {
          notes.push("ตัดรายการ sector_impacts ที่ไม่มีชื่อ sector ออก");
          continue;
        }
        const sector = normSector(entry.sector);
        if (!held.has(sector)) {
          notes.push(`ตัด sector_impacts "${sector}" ออก — ไม่ใช่ sector ที่ลูกค้าถือครอง`);
          continue;
        }
        if (seen.has(sector)) {
          notes.push(`ตัด sector_impacts "${sector}" ที่ซ้ำออก (ใช้รายการแรก)`);
          continue;
        }
        seen.add(sector);
        let direction = typeof entry.direction === "string" ? entry.direction.trim().toLowerCase() : "";
        if (!DIRECTIONS.has(direction)) {
          notes.push(`ทิศทางของ "${sector}" ไม่ถูกต้อง — ตั้งเป็น neutral`);
          direction = "neutral";
        } else if (entry.direction !== direction || entry.sector !== sector) {
          notes.push(`ปรับรูปแบบ sector_impacts "${sector}" เป็นตัวพิมพ์เล็ก`);
        }

        // reason: trimmed and capped. A non-neutral entry WITHOUT a reason is
        // kept — dropping it would silently remove that sector's clients — and
        // flagged for the CIO instead (Agent 2 also treats it as blocking).
        let reason;
        if (typeof entry.reason === "string") {
          reason = entry.reason.trim();
          if (reason.length > MAX_SECTOR_REASON_CHARS) {
            reason = `${reason.slice(0, MAX_SECTOR_REASON_CHARS - 1)}…`;
            notes.push(`ตัดเหตุผลของ "${sector}" ให้ยาวไม่เกิน ${MAX_SECTOR_REASON_CHARS} ตัวอักษร`);
          }
        } else if (entry.reason !== undefined) {
          notes.push(`ตัดเหตุผลของ "${sector}" ที่ไม่ใช่ข้อความออก`);
        }
        if (!reason && direction !== "neutral") {
          noteOnce(`sector "${sector}" (${direction}) ไม่มีเหตุผลประกอบ (reason) — โปรดตรวจสอบก่อนอนุมัติ`);
        }

        // Only { sector, direction, reason } survive — extra keys never reach matching.
        kept.push(reason ? { sector, direction, reason } : { sector, direction });
      }
      out.sector_impacts = kept;

      // Union: a sector with a stated NON-neutral impact must be matchable.
      // Neutral entries are skipped here and removed below, so the union can
      // never (re-)add a sector that is not supposed to drive matching.
      const affected = Array.isArray(out.affected_sectors) ? [...out.affected_sectors] : [];
      for (const { sector, direction } of kept) {
        if (direction !== "neutral" && !affected.includes(sector)) {
          affected.push(sector);
          notes.push(`เพิ่ม "${sector}" เข้า affected_sectors ให้ตรงกับ sector_impacts (มิฉะนั้นลูกค้ากลุ่มนี้จะหลุดจากรายชื่อ)`);
        }
      }

      // The one exception to "never remove from affected_sectors": a sector the
      // model EXPLICITLY tagged neutral does not drive client matching (live
      // 2026-09-17: neutral energy/technology/healthcare put all 10 clients on
      // an FOMC call list). The entry stays in sector_impacts for display.
      // Sectors with no sector_impacts entry are untouched (matching falls back
      // to top-level sentiment), and ticker matches are unaffected.
      const neutral = new Set(kept.filter((k) => k.direction === "neutral").map((k) => k.sector));
      const removed = affected.filter((s) => neutral.has(s));
      if (removed.length > 0) {
        notes.push(
          `นำ sector ที่เป็นกลาง (neutral) ออกจาก affected_sectors: ${removed.join(", ")} — ไม่ใช้จับคู่ลูกค้า`,
        );
      }
      const finalAffected = affected.filter((s) => !neutral.has(s));
      if (kept.length > 0 || Array.isArray(out.affected_sectors)) out.affected_sectors = finalAffected;
    }
  }

  // event_scope: invalid -> removed (matching then defaults to "systemic").
  if (out.event_scope !== undefined) {
    const scope = typeof out.event_scope === "string" ? out.event_scope.trim().toLowerCase() : "";
    if (!EVENT_SCOPES.has(scope)) {
      delete out.event_scope;
      notes.push("ลบ event_scope ที่ไม่ถูกต้อง — ระบบจับคู่ใช้ค่าเริ่มต้น systemic");
    } else {
      if (scope !== out.event_scope) notes.push(`ปรับรูปแบบ event_scope เป็น "${scope}"`);
      out.event_scope = scope;
    }
  }

  // single_company is NEVER rewritten to another scope: widening it would bring
  // back exactly the sector sweep the scope exists to prevent. If no listed
  // ticker is held, the client list will be empty — explain that instead.
  if (out.event_scope === "single_company") {
    const tickers = (Array.isArray(out.affected_tickers) ? out.affected_tickers : [])
      .map((t) => String(t).trim().toUpperCase());
    const heldT = heldTickers ? new Set([...heldTickers].map((t) => String(t).toUpperCase())) : null;
    const anyHeld = heldT ? tickers.some((t) => heldT.has(t)) : tickers.length > 0;
    if (!anyHeld) {
      noteOnce(
        "ข่าวรายบริษัท (single_company) แต่ไม่มีลูกค้ารายใดถือหุ้นของบริษัทที่ระบุ — จึงไม่มีลูกค้าในรายชื่อ",
      );
    }
  }

  out.normalization_notes = notes;
  return out;
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

## What to check (only these — you have the context to judge them)
1. Dislocation honesty — if dislocation_detected is true, does the market outcome actually describe a move that diverges from the stated expectation? Flag a dislocation that the outcome text does not support. If dislocation_detected is false, is that consistent with the outcome?
2. Sentiment — "sentiment" is the EXPECTED (theoretical) net impact of the news on the listed sectors, judged before any market reaction. Flag it ONLY if it is inconsistent with the sector_impacts directions (e.g. every listed sector "negative" but sentiment "positive"); if sector_impacts is absent, flag only an obvious contradiction with the news itself. NEVER flag sentiment for diverging from the actual market reaction when a dislocation is described — that divergence IS the dislocation (check 1 covers it).
3. Narrative grounding — is the reasoning / dislocation_description built on facts (numbers, price moves, events) that actually appear in the news content or market outcome? Flag an invented number, a price move the outcome does not describe, or a named precedent/reference case that does not appear in the source (e.g. a dated historical analogy). Second-order causal reasoning FROM the source facts is allowed (see below) — flag only fabricated facts, not inferences drawn from real ones.
4. Event scope — if event_scope is present, is it consistent with the news text? "single_company" = the news is about one named company; "sector" = about one industry as a whole; "systemic" = macro / market-wide (rates, tariffs, FX, risk-off). Flag a clear mismatch (e.g. a central-bank rate decision labelled "single_company", or one company's deal labelled "systemic").
5. Sector directions and reasons — if sector_impacts is present, check every entry whose direction is "positive" or "negative" (skip "neutral" entries). Mixed directions are legitimate (a rate hike can be positive for banking and negative for property). Flag the entry as a blocking issue if ANY of these hold:
   - its "reason" is missing or empty;
   - the reason or direction contradicts the news content or market outcome (e.g. the text says property benefits but the direction is "negative");
   - the reason introduces factual claims not present in the source (figures, events, company-specific facts);
   - the reason describes a mechanism that does not fit that sector according to the SHARED SECTOR TABLE below (e.g. calling transport a "bond proxy" — only utilities/power and telecom are bond proxies there). Judge mechanisms against that table, not your own sector taxonomy.
   A general, sector-appropriate economic mechanism (e.g. "higher rates raise borrowing costs" for property) is acceptable even though the source does not spell it out — do NOT flag it. Do not flag WHICH sectors are listed — only each entry's direction and reason.

## Shared sector table (the SAME reference the analyst used)
${SECTOR_MECHANISM_TABLE}

## Verify against the provided source ONLY
Judge every claim solely against the news content and market outcome given below. Your own background knowledge may be outdated or incomplete: never flag a name, title, date, figure, rate level, or event as wrong because it differs from what you remember. If the source states it, treat it as true for this check.

## Do NOT flag affected_tickers or affected_sectors expansion (out of scope by design)
Agent 1 is SUPPOSED to expand from the news to the specific SET tickers and sectors it touches, using documented sector→macro-factor mappings (the dislocation-analysis skill). A tariff/risk-off event legitimately reaches banking, property, healthcare, energy, transport and more via second-order effects, even when the news text only names "exporters." This expansion is Agent 1's job, and the resulting lists feed a SEPARATE deterministic matcher (matching.js) which is the actual source of truth for client exposure — not your concern here.

Therefore: NEVER flag a ticker or sector merely because it is not named verbatim in the news. Do not treat sector expansion, second-order inference, or the length of affected_tickers/affected_sectors as a hallucination or overreach. You lack the holdings universe, so you are NOT positioned to judge those lists — leave them alone entirely. (The shared sector table is for judging each listed sector's direction and reason, not for deciding which sectors belong in the list.)

## What you must NOT do
- Do not flag affected_tickers / affected_sectors expansion (see above).
- Do not add new analysis, new tickers, or new trade ideas.
- Do not re-score or re-rank anything.
- Do not rewrite the analysis unless you found a real narrative problem.
- When in doubt, do not flag — a false alarm wastes the human reviewer's time.
- Do not list observations you conclude are acceptable. If you examine something and decide it is fine (e.g. "this is acceptable second-order reasoning", "not a real problem"), leave it out entirely — flagged_issues is not a notes field.

## flagged_issues and is_valid must agree
flagged_issues contains ONLY problems serious enough that the CIO should not approve the draft as written. is_valid is false if and only if flagged_issues is non-empty: no issues -> is_valid true; one or more issues -> is_valid false.

## Output
Return ONLY a JSON object, no markdown fences, no prose around it, with exactly these keys:
{
  "is_valid": boolean,            // true exactly when flagged_issues is empty
  "flagged_issues": [string],     // Thai. One short line per approval-blocking problem; empty array if none
  "adjusted_reasoning": string    // Thai. If issues were found, a corrected version of Agent 1's reasoning with the unsupported claims removed/fixed. If none, echo Agent 1's reasoning unchanged.
}
Write flagged_issues and adjusted_reasoning in Thai (the RM-facing language). Keep the JSON keys in English exactly as above.`;

// factCheck — Agent 2. Verifies an Agent 1 result against the source news.
// Input: the original news item (content + marketOutcome) and the parsed
// Agent 1 output. Output: parsed JSON — is_valid, flagged_issues,
// adjusted_reasoning. Feed the news, NOT the holdings summary: Agent 2 must
// judge Agent 1 against the source only, with no extra context to anchor on.
async function factCheck(news, agent1Output) {
  // normalization_notes are the server's own bookkeeping, not Agent 1 claims —
  // showing them to the fact checker would invite it to "verify" them.
  const { normalization_notes: _notes, ...toVerify } = agent1Output;
  const user = `ORIGINAL NEWS HEADLINE: ${news.headline}

ORIGINAL NEWS CONTENT:
${news.content}

MARKET OUTCOME (what the market actually did):
${news.marketOutcome}

AGENT 1 ANALYSIS TO VERIFY (JSON):
${JSON.stringify(toVerify, null, 2)}

Verify the Agent 1 analysis against the original news and market outcome above. Return the JSON object only.`;

  // adjusted_reasoning can echo Agent 1's full reasoning; match Agent 1's
  // headroom so a verbose correction is never truncated into invalid JSON.
  const raw = await callClaude({
    system: AGENT2_SYSTEM_PROMPT,
    user,
    maxTokens: 2048,
  });
  const parsed = parseAIResponse(raw);
  // Same rule as Agent 1: the notes field is the server's, never the model's.
  if (parsed && typeof parsed === "object") delete parsed.factcheck_normalization_notes;
  return normalizeAgent2Output(parsed);
}

// normalizeAgent2Output — deterministic consistency guard for the fact check.
// The Phase 3 live run returned is_valid: false with issues the model itself
// called "not a real problem", and the CIO view keys its verdict on is_valid.
// The prompt now forbids that, but the verdict is too important to trust to the
// prompt alone, so it is DERIVED here: is_valid === (flagged_issues is empty).
// Pure, idempotent, never mutates its input; every change is noted in Thai.
export function normalizeAgent2Output(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return output;
  const out = { ...output };
  const notes = Array.isArray(output.factcheck_normalization_notes)
    ? output.factcheck_normalization_notes.filter((n) => typeof n === "string")
    : [];

  // flagged_issues: keep non-empty strings only. A bare string is one issue.
  const rawIssues = out.flagged_issues;
  let issues;
  if (rawIssues === undefined) {
    issues = [];
  } else if (Array.isArray(rawIssues)) {
    issues = rawIssues.filter((i) => typeof i === "string" && i.trim() !== "");
    if (issues.length !== rawIssues.length) {
      notes.push("ตัดรายการ flagged_issues ที่ว่างหรือไม่ใช่ข้อความออก");
    }
  } else if (typeof rawIssues === "string" && rawIssues.trim() !== "") {
    issues = [rawIssues];
    notes.push("แปลง flagged_issues จากข้อความเดี่ยวเป็นรายการ");
  } else {
    issues = [];
    notes.push("flagged_issues มีรูปแบบไม่ถูกต้อง — ตั้งเป็นรายการว่าง");
  }
  out.flagged_issues = issues;

  const derived = issues.length === 0;
  if (out.is_valid !== derived) {
    notes.push(
      derived
        ? "ปรับ is_valid เป็น true — ไม่มีประเด็นที่ถูกระบุใน flagged_issues"
        : `ปรับ is_valid เป็น false — มีประเด็นที่ถูกระบุ ${issues.length} ข้อ`,
    );
    out.is_valid = derived;
  }

  out.factcheck_normalization_notes = notes;
  return out;
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
// MAX_SCRIPT_CHARS — the deterministic proxy for the "max 3 sentences" rule.
// Thai has no reliable sentence delimiter (no full stop; spaces separate clauses
// as often as sentences), so the server cannot count sentences — it counts
// characters. 600 = the longest ACCEPTED cached script (N006/C004, 581 chars;
// the 13 cached N006/N003 scripts average 476.5) rounded up to the nearest 50.
// Over-long scripts are flagged (length_exceeded), never truncated.
export const MAX_SCRIPT_CHARS = 600;

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

## Direction per holding — mixed exposure
Each affected holding may be tagged with a direction: positive (the event tends to help it), negative (tends to hurt it), or neutral. Describe each holding's effect in the direction it is tagged — never call a "negative" holding a beneficiary or vice versa.
When the client has BOTH positive and negative holdings, the script must mention both sides briefly (e.g. "หุ้น KBANK ในพอร์ตได้แรงหนุนจากดอกเบี้ยที่สูงขึ้น ขณะที่ LH อาจถูกกดดันจากต้นทุนสินเชื่อ"), still within the sentence limit. Presenting both sides is information, not a suggestion to rebalance — do not tell the client to shift between them.
A holding may also carry a "sector mechanism": the approved, fact-checked reason this event moves that holding's sector. Use it to explain the effect on that holding in plain words. Do not add facts, figures or claims beyond it and the approved insight.

## Tone by risk profile
Tone changes the framing, not the informational stance. Every profile stays non-directive.
- conservative — cautious framing. Mention downside and uncertainty explicitly. Emphasize this is information to be aware of, not a reason to act. Reassuring, low-pressure.
- moderate — balanced framing. Present the fact and its two-sided nature plainly. Neither alarmed nor pushy.
- aggressive — direct framing. Get to the point quickly and name the opportunity angle. Still NEVER directive — "this is an interesting dislocation worth looking at" is fine; "you should buy" is not.

## Structure
1. Max 3 sentences AND at most ${MAX_SCRIPT_CHARS} characters in total (the script is checked by character count — Thai characters, including spaces).
2. If the client has many affected holdings, focus on at most TWO — the most relevant ones. If the client has both positive and negative holdings, pick one from each side. Do not list every holding.
3. Lead with the relevant fact — the dislocation or the news, stated plainly.
4. End with an open invitation to discuss, not a call to action ("หากสนใจ เราคุยรายละเอียดกันได้"), never a trade prompt.
Address the client by name at the start.

## Reported facts vs mechanisms — keep them separate
- REPORTED FACTS are figures and moves stated in the approved insight below (the dislocation text and reasoning, which were fact-checked against the news and market data) — e.g. an index change or a price move the insight reports. State them plainly.
- MECHANISMS are the sector mechanisms and theoretical effects (why a sector tends to move). State them with hedged language such as "มีแนวโน้ม" or "อาจ".
- Never present a mechanism as something that already happened to a specific stock (e.g. do not write that TRUE "was pressured" or DELTA "gained support") unless the approved insight reports that stock's actual move. "DELTA มีแนวโน้มได้แรงหนุนจากค่าเงินบาทที่อ่อนค่า" is fine; "DELTA ได้แรงหนุนแล้ว" is not, unless reported.

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
  // Direction and the sector's reason (looked up from the approved analysis by
  // the holding's sector) are appended only when present — cached/older
  // payloads lack them and must produce the exact same prompt as before.
  const sectorReasons = new Map(
    (Array.isArray(analysis.sector_impacts) ? analysis.sector_impacts : [])
      .filter((s) => typeof s?.reason === "string" && s.reason)
      .map((s) => [String(s.sector).toLowerCase(), s.reason]),
  );
  const matchedTickers = (client.matchedHoldings ?? [])
    .map((h) => {
      const reason = sectorReasons.get(String(h.sector ?? "").toLowerCase());
      return (
        `${h.ticker} (${h.name})` +
        (h.direction ? ` — direction: ${h.direction}` : "") +
        (reason ? ` — sector mechanism: ${reason}` : "")
      );
    })
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
  // length_exceeded is the server's verdict, never the model's.
  if (parsed && typeof parsed === "object") delete parsed.length_exceeded;
  // Fix known term typos before the script leaves this function — every caller
  // (single or batch) gets the corrected text.
  if (parsed && typeof parsed.script === "string") {
    parsed.script = correctThaiTerms(parsed.script);
    // Flag, do NOT truncate: cutting a Thai script mid-clause can drop the
    // meaning or the very caveat that keeps it informational. The flag lets the
    // UI warn the RM and the regen script refuse to cache it.
    if (parsed.script.length > MAX_SCRIPT_CHARS) parsed.length_exceeded = true;
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

// Fixed message: lists the allowed values, never echoes the caller's value.
function optionalEnum(value, field, allowed) {
  if (value !== undefined && !allowed.has(value)) {
    throw new RequestError(
      400,
      `invalid_request: ${field} must be one of ${[...allowed].map((v) => `"${v}"`).join(" | ")}`,
    );
  }
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
  // Phase 3 fields — optional (the endpoint only ever returns them normalized,
  // and older analyses lack them), strict when present. Checked for BOTH the
  // factcheck and the script payload: sector reasons reach the Agent 3 prompt.
  optionalEnum(a.event_scope, `${field}.event_scope`, EVENT_SCOPES);
  if (a.sector_impacts !== undefined) {
    if (!Array.isArray(a.sector_impacts)) {
      throw new RequestError(400, `invalid_request: ${field}.sector_impacts must be an array`);
    }
    a.sector_impacts.forEach((s, i) => {
      const f = `${field}.sector_impacts[${i}]`;
      requireObject(s, f);
      requireString(s.sector, `${f}.sector`, { maxChars: MAX_PROMPT_FIELD_CHARS });
      if (s.direction === undefined) {
        throw new RequestError(400, `invalid_request: ${f}.direction is required`);
      }
      optionalEnum(s.direction, `${f}.direction`, DIRECTIONS);
      optionalString(s.reason, `${f}.reason`, { maxChars: MAX_SECTOR_REASON_CHARS });
    });
  }
  if (a.normalization_notes !== undefined) {
    requireStringArray(a.normalization_notes, `${field}.normalization_notes`);
  }
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
      // Optional (cached runs predate them) but exact when present: direction
      // is interpolated into the Agent 3 prompt, so it must be a known token.
      optionalEnum(h.direction, `${f}.direction`, DIRECTIONS);
      optionalEnum(h.matchedBy, `${f}.matchedBy`, MATCHED_BY);
      // sector keys the lookup of the analysis' sector reason for Agent 3.
      optionalString(h.sector, `${f}.sector`, { maxChars: MAX_PROMPT_FIELD_CHARS });
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
