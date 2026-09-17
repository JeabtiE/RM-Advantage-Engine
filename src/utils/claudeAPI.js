// claudeAPI.js — client transport for the 3 agent calls.
//
// TRANSPORT SWAP (see api/claude-agent.js): the browser no longer calls
// Anthropic directly. analyzeImpact / factCheck / generateScript now POST to the
// server-side /api/claude-agent endpoint, which holds the API key
// (ANTHROPIC_API_KEY, server-only) and owns the actual Anthropic fetch, the
// retry/backoff, the prompt text, and JSON parsing. This module is now a thin
// transport: build the payload, POST it, return the parsed JSON the endpoint
// hands back.
//
// WHY: the key must never reach the browser bundle. All VITE_ANTHROPIC_API_KEY
// references and the anthropic-dangerous-direct-browser-access header are gone —
// there is no direct-to-Anthropic path in client code anymore.
//
// PUBLIC SURFACE IS UNCHANGED: analyzeImpact(news, holdingsSummary),
// factCheck(news, agent1Output), generateScript(analysis, client) and
// generateAllScripts(analysis, clients) keep the exact same signatures and
// return the exact same shapes (the endpoint returns the same parsed JSON the
// old callClaude→parseAIResponse path produced). useDraft.js and every component
// work unchanged.

const AGENT_PATH = "/api/claude-agent";
const MAX_RETRIES = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// resolveEndpoint — in the browser this is the origin-relative path, which works
// both under `npm run dev` (the Vite dev plugin mounts /api/claude-agent) and on
// Vercel. A node caller (the regen script / test harnesses, which used to call
// Anthropic directly but now must go through the endpoint like everyone else)
// can set AGENT_ENDPOINT_BASE to a running server, e.g. "http://localhost:5173".
function resolveEndpoint() {
  const base =
    typeof process !== "undefined" && process.env?.AGENT_ENDPOINT_BASE;
  return base ? new URL(AGENT_PATH, base).toString() : AGENT_PATH;
}

// Error code the endpoint returns (503) when LIVE_AGENT_ENABLED is not "true" —
// the public deployment runs this way on purpose. Exported so the UI can show a
// neutral "disabled" notice instead of a failure card.
export const LIVE_MODE_DISABLED = "live_mode_disabled";

// Shown wherever the error message surfaces (NewsFeed card, per-client script
// errors), so even a view that doesn't special-case the code reads sensibly.
const LIVE_MODE_DISABLED_MESSAGE =
  "การวิเคราะห์สด (live analysis) ปิดอยู่บนเดโมสาธารณะ — " +
  "ข่าวที่มีผลวิเคราะห์สำรองไว้ (cached demo) ยังใช้งานได้ตามปกติ";

// postAgent — single POST to /api/claude-agent for one agent. The endpoint owns
// the Anthropic retry/backoff (max 2, 429 → 10s); we do NOT re-retry an HTTP
// error here or the two backoffs would stack — every non-2xx (4xx, 503 kill
// switch, 5xx) throws a plain Error and exits the loop. We DO retry a
// network-level failure (fetch rejected before the server processed anything),
// since that is our request never landing, not the server giving up. Returns the
// parsed JSON. Thrown HTTP errors carry `status` and `code` (the endpoint's
// { error } string) so callers can branch without parsing the message.
async function postAgent(agent, payload) {
  const url = resolveEndpoint();
  const body = JSON.stringify({ agent, ...payload });

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });

      if (!res.ok) {
        // The endpoint answers errors as { error }. Read the body ONCE as text
        // and parse it ourselves: calling res.text() after a failed res.json()
        // throws a TypeError (body already used), which the catch below would
        // mistake for a network failure and retry. A non-JSON body (e.g. a
        // platform 504 page) is reported by status only.
        let code = null;
        try {
          code = JSON.parse(await res.text())?.error ?? null;
        } catch {
          code = null;
        }
        const message =
          code === LIVE_MODE_DISABLED
            ? LIVE_MODE_DISABLED_MESSAGE
            : `Agent "${agent}" request failed (${res.status})${code ? `: ${code}` : ""}`;
        throw Object.assign(new Error(message), { status: res.status, code });
      }

      return await res.json();
    } catch (err) {
      lastErr = err;
      const isNetwork = err instanceof TypeError; // fetch rejects with TypeError on network failure
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
// instructions), then JSON.parse. The endpoint now does the parsing server-side,
// so the client path no longer calls this — it is kept exported as a pure
// utility (CLAUDE.md constraint #7 documents it) for any out-of-band caller.
export function parseAIResponse(raw) {
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
// (Prompt + Anthropic call now live in api/claude-agent.js.)
// -------------------------------------------------------------------------
export async function analyzeImpact(news, holdingsSummary) {
  return postAgent("impact", { news, holdingsSummary });
}

// ---------------------------------------------------------------------------
// Agent 2 — Fact Checker (the machine half of "Four Eyes")
// Input: the original news item (content + marketOutcome) and the parsed
// Agent 1 output. Output: parsed JSON — is_valid, flagged_issues,
// adjusted_reasoning.
// (Prompt + Anthropic call now live in api/claude-agent.js.)
// ---------------------------------------------------------------------------
export async function factCheck(news, agent1Output) {
  return postAgent("factcheck", { news, agent1Output });
}

// Post-processing typo guard for Agent 3 output. The endpoint already applies
// this before returning, so this is idempotent defense-in-depth on the client
// side — a known Thai financial-term typo can never slip through to an RM/client
// regardless of which side ran. This is a spell-fix, NOT a rewrite: keep entries
// to exact wrong→right pairs with a single correct answer; never add anything
// requiring judgment about meaning or tone. Kept in sync with the same table in
// api/claude-agent.js.
const THAI_TERM_CORRECTIONS = [
  ["สภาพคล็อง", "สภาพคล่อง"], // "liquidity" — glottal-tone typo seen in the N006 batch
];

// correctThaiTerms — literal (non-regex) global replace of each known typo. Uses
// split/join so the patterns need no regex escaping and can't misfire on special
// characters. Returns non-strings untouched so a malformed response can't throw.
export function correctThaiTerms(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const [wrong, right] of THAI_TERM_CORRECTIONS) {
    out = out.split(wrong).join(right);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Agent 3 — Script Generator (per client)
// Input: the APPROVED analysis (the fact-checked insight — dislocation +
// reasoning + sentiment) and the client (name, riskProfile, matchedHoldings).
// Output: parsed JSON — { script }.
// (Prompt + Anthropic call now live in api/claude-agent.js.)
// ---------------------------------------------------------------------------
export async function generateScript(analysis, client) {
  const parsed = await postAgent("script", { analysis, client });
  // The endpoint already ran the typo guard; re-run it here so the correction
  // holds even if a caller ever points at a server that didn't (idempotent).
  if (parsed && typeof parsed.script === "string") {
    parsed.script = correctThaiTerms(parsed.script);
  }
  return parsed;
}

// generateAllScripts — batch Agent 3 across many clients. Uses Promise.allSettled
// (NEVER Promise.all — CLAUDE.md hard constraint #4): one client's failed request
// must not wipe out every other client's script mid-demo. Returns one entry per
// input client, in the same order, each tagging success/failure so the caller
// (ScriptViewer) can render the scripts it got and flag the ones that failed.
// Each generateScript is now its own POST to /api/claude-agent — the batching and
// per-client failure isolation stay client-side, exactly as before.
export async function generateAllScripts(analysis, clients) {
  const settled = await Promise.allSettled(
    clients.map((client) => generateScript(analysis, client)),
  );

  return settled.map((outcome, i) => {
    const client = clients[i];
    if (outcome.status === "fulfilled") {
      return {
        clientId: client.clientId,
        name: client.name,
        riskProfile: client.riskProfile,
        ok: true,
        script: outcome.value.script,
      };
    }
    return {
      clientId: client.clientId,
      name: client.name,
      riskProfile: client.riskProfile,
      ok: false,
      error: outcome.reason?.message ?? String(outcome.reason),
    };
  });
}
