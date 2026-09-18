// Endpoint validation tests for api/claude-agent.js.
//
// NEVER calls the real Anthropic API: globalThis.fetch is replaced for every
// test with a stub that records calls and answers with a canned response. Tests
// that expect a rejection also assert the stub was never reached.
//
// Run: npm test

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import handler, {
  SECTOR_MECHANISM_TABLE,
  MAX_SCRIPT_CHARS,
  AGENT3_FEW_SHOT_EXAMPLES,
} from "../api/claude-agent.js";
import { mockNews } from "../src/data/mockNews.js";
import { cachedDemoRuns } from "../src/data/cachedDemoRun.js";
import { buildHoldingsSummary } from "../src/utils/matching.js";
import { adaptLiveItem } from "../src/utils/liveNews.js";

const realFetch = globalThis.fetch;
const realConsoleError = console.error;
let fetchCalls;
let fetchResponder;

// Canned Anthropic Messages API response wrapping `obj` as the model's text.
const anthropicOk = (obj) =>
  new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(obj) }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  fetchCalls = [];
  fetchResponder = () => anthropicOk({ ok: true });
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return fetchResponder(url, init);
  };
  console.error = () => {}; // handler logs upstream failures; keep output clean
  process.env.LIVE_AGENT_ENABLED = "true";
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realConsoleError;
  delete process.env.LIVE_AGENT_ENABLED;
  delete process.env.ANTHROPIC_API_KEY;
});

// Minimal Vercel-style req/res pair.
async function call({ method = "POST", body, headers = {} } = {}) {
  const out = { status: null, body: null, headers: {} };
  const res = {
    setHeader(k, v) { out.headers[k] = v; return res; },
    status(code) { out.status = code; return res; },
    json(b) { out.body = b; return res; },
  };
  await handler({ method, body, headers }, res);
  return out;
}

const n006 = mockNews.find((n) => n.id === "N006");
const n006Run = cachedDemoRuns.N006;
const impactBody = () => ({
  agent: "impact",
  news: { ...n006 },
  holdingsSummary: buildHoldingsSummary(),
});

function assertRejected(out, status) {
  assert.equal(out.status, status);
  assert.deepEqual(Object.keys(out.body), ["error"], "error body must be { error } only");
  assert.equal(typeof out.body.error, "string");
  assert.equal(fetchCalls.length, 0, "must not reach the Anthropic API");
}

// --- 405 ---------------------------------------------------------------------

test("GET -> 405", async () => {
  const out = await call({ method: "GET" });
  assertRejected(out, 405);
  assert.equal(out.headers.Allow, "POST");
});

test("GET -> 405 even when the kill switch is off", async () => {
  delete process.env.LIVE_AGENT_ENABLED;
  assertRejected(await call({ method: "GET" }), 405);
});

// --- 503 kill switch -----------------------------------------------------------

test("kill switch unset -> 503 live_mode_disabled, before any validation", async () => {
  delete process.env.LIVE_AGENT_ENABLED;
  const out = await call({ body: impactBody() });
  assertRejected(out, 503);
  assert.equal(out.body.error, "live_mode_disabled");
  // Even garbage gets 503, not 400 — a disabled deploy reveals nothing.
  assertRejected(await call({ body: { agent: "nope" } }), 503);
});

test("kill switch only accepts the exact string 'true'", async () => {
  for (const v of ["false", "TRUE", "1", "yes", ""]) {
    process.env.LIVE_AGENT_ENABLED = v;
    const out = await call({ body: impactBody() });
    assert.equal(out.status, 503, `LIVE_AGENT_ENABLED=${JSON.stringify(v)}`);
  }
  assert.equal(fetchCalls.length, 0);
});

// --- 400 agent allowlist -----------------------------------------------------

test("unknown agent -> 400 without echoing the value", async () => {
  const out = await call({ body: { agent: "<script>evil</script>" } });
  assertRejected(out, 400);
  assert.ok(!out.body.error.includes("evil"));
});

test("missing / non-string / prototype-key agent -> 400", async () => {
  for (const agent of [undefined, 1, ["impact"], "IMPACT", "constructor", "toString"]) {
    assertRejected(await call({ body: { ...impactBody(), agent } }), 400);
  }
});

test("malformed JSON string body -> 400", async () => {
  const out = await call({ body: "{not json" });
  assertRejected(out, 400);
  assert.equal(out.body.error, "invalid_json");
});

test("non-object body -> 400", async () => {
  for (const body of [[], "[]", "42", "null"]) {
    assertRejected(await call({ body }), 400);
  }
});

// --- 400 missing / invalid fields ------------------------------------------------

test("impact: missing fields -> 400", async () => {
  const cases = [
    { agent: "impact" },
    { ...impactBody(), news: undefined },
    { ...impactBody(), news: "headline" },
    { ...impactBody(), holdingsSummary: undefined },
    { ...impactBody(), holdingsSummary: 42 },
    { ...impactBody(), news: { ...n006, headline: undefined } },
    { ...impactBody(), news: { ...n006, headline: "   " } },
    { ...impactBody(), news: { ...n006, content: undefined } },
    { ...impactBody(), news: { ...n006, content: ["a"] } },
    { ...impactBody(), news: { ...n006, marketOutcome: undefined } },
  ];
  for (const body of cases) assertRejected(await call({ body }), 400);
});

test("factcheck: missing / mistyped fields -> 400", async () => {
  const base = { agent: "factcheck", news: n006, agent1Output: n006Run.analysis };
  const a = n006Run.analysis;
  const cases = [
    { ...base, agent1Output: undefined },
    { ...base, agent1Output: "{}" },
    { ...base, news: undefined },
    { ...base, agent1Output: { ...a, sentiment: undefined } },
    { ...base, agent1Output: { ...a, affected_tickers: "KBANK" } },
    { ...base, agent1Output: { ...a, affected_sectors: [1, 2] } },
    { ...base, agent1Output: { ...a, dislocation_detected: "true" } },
    { ...base, agent1Output: { ...a, reasoning: 5 } },
  ];
  for (const body of cases) assertRejected(await call({ body }), 400);
});

test("script: missing / mistyped fields -> 400", async () => {
  const client = n006Run.affectedClients[0];
  const base = { agent: "script", analysis: n006Run.analysis, client };
  const cases = [
    { ...base, client: undefined },
    { ...base, analysis: undefined },
    { ...base, client: { ...client, name: undefined } },
    { ...base, client: { ...client, riskProfile: "yolo" } },
    { ...base, client: { ...client, matchedHoldings: "DELTA" } },
    { ...base, client: { ...client, matchedHoldings: [{ ticker: "DELTA" }] } },
    { ...base, analysis: { ...n006Run.analysis, sentiment: null } },
  ];
  for (const body of cases) assertRejected(await call({ body }), 400);
});

// --- 413 size caps -----------------------------------------------------------------

test("oversized news.content -> 413", async () => {
  const body = impactBody();
  body.news.content = "ก".repeat(4_001);
  const out = await call({ body });
  assertRejected(out, 413);
  assert.match(out.body.error, /news\.content/);
});

test("oversized news.headline -> 413", async () => {
  const body = impactBody();
  body.news.headline = "x".repeat(501);
  assertRejected(await call({ body }), 413);
});

test("oversized forwarded string fields -> 413", async () => {
  const big = "x".repeat(4_001);
  const client = n006Run.affectedClients[0];
  const cases = [
    { ...impactBody(), holdingsSummary: big },
    { ...impactBody(), news: { ...n006, marketOutcome: big } },
    { agent: "factcheck", news: n006, agent1Output: { ...n006Run.analysis, reasoning: big } },
    // Unknown key: still reaches the Agent 2 prompt via JSON.stringify.
    { agent: "factcheck", news: n006, agent1Output: { ...n006Run.analysis, extra: big } },
    { agent: "script", analysis: n006Run.analysis, client: { ...client, name: big } },
  ];
  for (const body of cases) assertRejected(await call({ body }), 413);
});

test("oversized arrays -> 413", async () => {
  const body = {
    agent: "factcheck",
    news: n006,
    agent1Output: { ...n006Run.analysis, affected_tickers: Array(101).fill("KBANK") },
  };
  assertRejected(await call({ body }), 413);
});

test("oversized total body -> 413 (object and string bodies)", async () => {
  // Many individually-legal strings that add up past the body cap.
  const padded = { ...impactBody(), padding: Array(20).fill("x".repeat(3_999)) };
  assertRejected(await call({ body: padded }), 413);
  assertRejected(await call({ body: JSON.stringify(padded) }), 413);
});

test("declared content-length over the cap -> 413 before parsing", async () => {
  const out = await call({ body: impactBody(), headers: { "content-length": "999999" } });
  assertRejected(out, 413);
});

// --- Real traffic must still pass ----------------------------------------------------

test("every real demo payload passes validation and reaches the API once", async () => {
  const bodies = [];
  for (const [id, run] of Object.entries(cachedDemoRuns)) {
    const news = mockNews.find((n) => n.id === id);
    bodies.push({ agent: "impact", news, holdingsSummary: buildHoldingsSummary() });
    bodies.push({ agent: "factcheck", news, agent1Output: run.analysis });
    const analysis = { ...run.analysis, reasoning: run.agent2Result.adjusted_reasoning };
    for (const client of run.affectedClients) {
      bodies.push({ agent: "script", analysis, client });
    }
  }
  // Uncached presets run live in the app, so they must validate too.
  for (const news of mockNews) {
    bodies.push({ agent: "impact", news, holdingsSummary: buildHoldingsSummary() });
  }
  for (const body of bodies) {
    fetchCalls = [];
    const out = await call({ body, headers: { "content-length": String(JSON.stringify(body).length) } });
    assert.equal(out.status, 200, `${body.agent}: ${JSON.stringify(out.body)}`);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://api.anthropic.com/v1/messages");
  }
});

test("script payload whose matchedHoldings carry matchedBy/direction passes validation", async () => {
  const client = {
    ...n006Run.affectedClients[0],
    matchedHoldings: n006Run.affectedClients[0].matchedHoldings.map((h) => ({
      ...h,
      matchedBy: "sector",
      direction: "negative",
    })),
  };
  const out = await call({ body: { agent: "script", analysis: n006Run.analysis, client } });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(fetchCalls.length, 1);
});

test("script payload: invalid direction / matchedBy -> 400", async () => {
  const base = n006Run.affectedClients[0];
  const withHolding = (patch) => ({
    ...base,
    matchedHoldings: [{ ...base.matchedHoldings[0], ...patch }],
  });
  for (const patch of [
    { direction: "bullish" },
    { direction: "POSITIVE" },
    { direction: 1 },
    { direction: null },
    { matchedBy: "name" },
    { matchedBy: "" },
  ]) {
    const out = await call({
      body: { agent: "script", analysis: n006Run.analysis, client: withHolding(patch) },
    });
    assertRejected(out, 400);
  }
});

test("script prompt includes each holding's direction only when present", async () => {
  const client = {
    name: "คุณทดสอบ",
    riskProfile: "moderate",
    matchedHoldings: [
      { ticker: "KBANK", name: "ธนาคารกสิกรไทย", direction: "positive", matchedBy: "sector" },
      { ticker: "LH", name: "แลนด์ แอนด์ เฮ้าส์" },
    ],
  };
  fetchResponder = () => anthropicOk({ script: "เรียนคุณทดสอบ" });
  const out = await call({ body: { agent: "script", analysis: n006Run.analysis, client } });
  assert.equal(out.status, 200);
  const prompt = JSON.parse(fetchCalls[0].init.body).messages[0].content;
  assert.match(prompt, /KBANK \(ธนาคารกสิกรไทย\) — direction: positive/);
  assert.match(prompt, /LH \(แลนด์ แอนด์ เฮ้าส์\)(?! — direction)/);
});

test("factcheck payload with normalized Phase 3 fields passes; malformed ones -> 400", async () => {
  const agent1Output = {
    ...n006Run.analysis,
    event_scope: "systemic",
    sector_impacts: [{ sector: "banking", direction: "negative" }],
    normalization_notes: ["note"],
  };
  const ok = await call({ body: { agent: "factcheck", news: n006, agent1Output } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  // Server bookkeeping is not shown to the fact checker.
  assert.ok(!JSON.parse(fetchCalls[0].init.body).messages[0].content.includes("normalization_notes"));

  fetchCalls = [];
  for (const patch of [
    { event_scope: "global" },
    { sector_impacts: "banking" },
    { sector_impacts: [{ sector: "banking" }] },
    { sector_impacts: [{ sector: "banking", direction: "up" }] },
    { sector_impacts: [{ direction: "positive" }] },
    { normalization_notes: [1] },
  ]) {
    assertRejected(await call({ body: { agent: "factcheck", news: n006, agent1Output: { ...agent1Output, ...patch } } }), 400);
  }
});

test("temperature sent to Anthropic is 0 for Agent 1 and Agent 2 (and unchanged 0 for Agent 3)", async () => {
  const bodies = [
    impactBody(),
    { agent: "factcheck", news: n006, agent1Output: n006Run.analysis },
    { agent: "script", analysis: n006Run.analysis, client: n006Run.affectedClients[0] },
  ];
  for (const body of bodies) {
    fetchCalls = [];
    const out = await call({ body });
    assert.equal(out.status, 200, body.agent);
    assert.equal(JSON.parse(fetchCalls[0].init.body).temperature, 0, body.agent);
  }
});

// System prompt sent for one agent call (via the stubbed fetch).
async function systemPromptFor(body) {
  fetchCalls = [];
  const out = await call({ body });
  assert.equal(out.status, 200, body.agent);
  return JSON.parse(fetchCalls[0].init.body).system;
}

test("Agent 1 and Agent 2 prompts carry the SAME shared sector table; the skill doc matches it", async () => {
  const a1 = await systemPromptFor(impactBody());
  const a2 = await systemPromptFor({ agent: "factcheck", news: n006, agent1Output: n006Run.analysis });
  assert.ok(a1.includes(SECTOR_MECHANISM_TABLE), "Agent 1 prompt");
  assert.ok(a2.includes(SECTOR_MECHANISM_TABLE), "Agent 2 prompt");
  const skill = readFileSync(new URL("../skills/dislocation-analysis/SKILL.md", import.meta.url), "utf8")
    .replace(/\r\n/g, "\n");
  assert.ok(skill.includes("```text\n" + SECTOR_MECHANISM_TABLE + "\n```"), "skill doc §4 in sync");
  assert.match(SECTOR_MECHANISM_TABLE, /Utilities \/ Power .*bond proxy/);
  assert.match(SECTOR_MECHANISM_TABLE, /Telecom .*bond proxy/);
});

test("Agent 2 check 5 uses transport as the wrong-bond-proxy example and defers to the shared table", async () => {
  const a2 = await systemPromptFor({ agent: "factcheck", news: n006, agent1Output: n006Run.analysis });
  assert.match(a2, /calling transport a "bond proxy"/);
  assert.match(a2, /Judge mechanisms against that table, not your own sector taxonomy/);
  assert.ok(!a2.includes("such as utilities/power"), "old misleading example removed");
});

test("sentiment is defined as the expected pre-reaction impact in both prompts", async () => {
  const a1 = await systemPromptFor(impactBody());
  const a2 = await systemPromptFor({ agent: "factcheck", news: n006, agent1Output: n006Run.analysis });
  assert.match(a1, /"sentiment" is the EXPECTED \(theoretical\) net impact/);
  assert.match(a1, /belongs ONLY in dislocation_detected \/ dislocation_description/);
  assert.match(a2, /Flag it ONLY if it is inconsistent with the sector_impacts directions/);
  assert.match(a2, /NEVER flag sentiment for diverging from the actual market reaction when a dislocation is described/);
});

// Client-directed instructions — the ONLY action language Agent 1/2 must reject.
// Analyst-facing opportunity wording ("อาจเป็นโอกาสสะสม") is allowed by design.
const CLIENT_DIRECTED = [
  "ควรซื้อ",
  "ควรขาย",
  "ควรถือ",
  "แนะนำให้",
  "ควรเพิ่มสัดส่วน",
  "ควรลดสัดส่วน",
  "you should buy",
  "you should sell",
];

test("Agent 1 prompt limits dislocation/reasoning: source facts, shared table, forward guidance, analyst-facing only", async () => {
  const a1 = await systemPromptFor(impactBody());
  assert.match(a1, /## Limits on dislocation_description and reasoning/);
  assert.match(a1, /use ONLY facts stated in the news content and market outcome/);
  assert.match(a1, /use ONLY the shared sector table above/);
  assert.match(a1, /never contradict explicit forward guidance stated in the source/);
  // Analyst-facing opportunity language is explicitly permitted…
  assert.match(a1, /You MAY name a mispricing, an opportunity the market overlooked, or a possible accumulation opportunity/);
  assert.match(a1, /ALLOWED: "ทองคำปรับลงสวนทางภาวะ risk-off อาจเป็นโอกาสสะสม/);
  // …while addressing the client or instructing is not.
  assert.match(a1, /You must NOT address the client or issue an instruction/);
  assert.match(a1, /BANNED: "ควรซื้อทองคำตอนนี้"/);
  assert.match(a1, /never an instruction to a client \(see Limits\)/);
  // The canonical reference case keeps its original accumulation framing.
  assert.match(a1, /framed gold's decline as a possible accumulation opportunity rather than a warning/);
  // No blanket banned-word list any more.
  assert.ok(!/never suggest or imply an action/.test(a1));
});

test("Agent 2 check 6 flags only client-directed instructions and contradicted forward guidance", async () => {
  const a2 = await systemPromptFor({ agent: "factcheck", news: n006, agent1Output: n006Run.analysis });
  assert.match(a2, /6\. Client-directed instructions and forward guidance — flag as a blocking issue ONLY when/);
  assert.match(a2, /addresses the client or issues an instruction/);
  assert.match(a2, /contradicts explicit forward guidance stated in the source/);
  assert.match(a2, /Analyst-facing opportunity language is ALLOWED and must NOT be flagged/);
  assert.match(a2, /อาจเป็นโอกาสสะสม/);
  assert.ok(a2.indexOf("6. Client-directed instructions") < a2.indexOf("## Shared sector table"));
});

test("N006's cached dislocation text is analyst-facing, so it would pass check 6", () => {
  // Inspection, not a model call: the cached text names an accumulation
  // opportunity (allowed) and issues no client-directed instruction (the only
  // action language check 6 blocks). Phase 4.1's blanket ban would have failed it.
  const text = cachedDemoRuns.N006.analysis.dislocation_description;
  assert.match(text, /สะสม/, "names the accumulation opportunity");
  for (const phrase of CLIENT_DIRECTED) {
    assert.ok(!text.includes(phrase), `cached N006 text contains "${phrase}"`);
  }
  // The same holds for the reasoning and for the other cached scenarios.
  for (const [id, run] of Object.entries(cachedDemoRuns)) {
    for (const field of ["dislocation_description", "reasoning"]) {
      for (const phrase of CLIENT_DIRECTED) {
        assert.ok(!(run.analysis[field] ?? "").includes(phrase), `${id}.${field}: "${phrase}"`);
      }
    }
  }
});

test("Agent 3 keeps the strict client-facing ban regardless of the analyst-facing text", async () => {
  const a3 = await systemPromptFor({
    agent: "script",
    analysis: n006Run.analysis,
    client: n006Run.affectedClients[0],
  });
  assert.match(a3, /it does NOT license advice/);
  assert.match(a3, /may itself name an opportunity .*you must NOT carry that into the script/s);
  for (const banned of ["ควรซื้อ / ควรขาย / ควรถือ", "แนะนำให้…"]) assert.ok(a3.includes(banned), banned);
});

test("Agent 3 few-shot examples: in the prompt verbatim, within the cap, mechanisms hedged, facts plain", async () => {
  const a3 = await systemPromptFor({
    agent: "script",
    analysis: n006Run.analysis,
    client: n006Run.affectedClients[0],
  });
  const skill = readFileSync(new URL("../skills/rm-script-writing/SKILL.md", import.meta.url), "utf8")
    .replace(/\r\n/g, "\n");
  assert.equal(AGENT3_FEW_SHOT_EXAMPLES.length, 4);
  for (const { label, script } of AGENT3_FEW_SHOT_EXAMPLES) {
    assert.ok(a3.includes(`${label}:\n"${script}"`), `${label} rendered in prompt`);
    assert.ok(skill.includes(`> "${script}"`), `${label} in sync with the skill doc`);
    assert.ok(script.length <= MAX_SCRIPT_CHARS, `${label}: ${script.length} chars`);
    assert.ok(/มีแนวโน้ม|อาจ/.test(script), `${label}: mechanism hedged`);
    assert.ok(script.includes("2.3%"), `${label}: reported figure stated`);
    // Phrasings that stated an unreported per-stock effect as fact.
    for (const bad of ["กระแทก", "กดดันหุ้นกลุ่มส่งออกโดยตรง", "ถืออยู่ได้รับแรงกดดัน", "ควรซื้อ", "ควรขาย"]) {
      assert.ok(!script.includes(bad), `${label}: contains "${bad}"`);
    }
  }
  assert.match(a3, /No individual stock's move is reported/);
});

test("MAX_SCRIPT_CHARS = longest accepted cached script rounded up to the nearest 50", () => {
  const lengths = Object.values(cachedDemoRuns).flatMap((r) =>
    r.scripts.filter((s) => s.ok).map((s) => s.script.length),
  );
  const max = Math.max(...lengths);
  assert.equal(max, 581);
  assert.equal(MAX_SCRIPT_CHARS, Math.ceil(max / 50) * 50);
  assert.equal(MAX_SCRIPT_CHARS, 600);
});

test("Agent 3 prompt states the character budget, the two-holding focus and fact/mechanism separation", async () => {
  const a3 = await systemPromptFor({
    agent: "script",
    analysis: n006Run.analysis,
    client: n006Run.affectedClients[0],
  });
  assert.match(a3, /Max 3 sentences AND at most 600 characters/);
  assert.match(a3, /focus on at most TWO/);
  assert.match(a3, /Reported facts vs mechanisms/);
  assert.match(a3, /มีแนวโน้ม/);
});

test("over-long script is flagged length_exceeded and returned in full (never truncated)", async () => {
  const client = n006Run.affectedClients[0];
  const cases = [
    { text: "ก".repeat(MAX_SCRIPT_CHARS), flagged: false },
    { text: "ก".repeat(MAX_SCRIPT_CHARS + 1), flagged: true },
    { text: "ข".repeat(MAX_SCRIPT_CHARS * 2), flagged: true },
  ];
  for (const { text, flagged } of cases) {
    fetchCalls = [];
    // The model also tries to set the flag itself — the server must ignore it.
    fetchResponder = () => anthropicOk({ script: text, length_exceeded: !flagged });
    const out = await call({ body: { agent: "script", analysis: n006Run.analysis, client } });
    assert.equal(out.status, 200);
    assert.equal(out.body.script, text, "script returned untruncated");
    assert.equal(out.body.length_exceeded === true, flagged);
    if (!flagged) assert.equal("length_exceeded" in out.body, false);
  }
});

test("Agent 1 system prompt maps telecom as a rate-sensitive bond proxy", async () => {
  const out = await call({ body: impactBody() });
  assert.equal(out.status, 200);
  const { system } = JSON.parse(fetchCalls[0].init.body);
  assert.match(
    system,
    /Telecom \(ADVANC, TRUE, INTUCH\): interest rates — INVERSE \(bond proxy: stable cash flows, high dividends, high leverage\)/,
  );
  assert.match(system, /hurt property \/ utilities \/ telecom \/ rate-sensitive growth/);
});

test("sector_impacts reason: optional bounded string on factcheck and script payloads", async () => {
  const withImpacts = (sector_impacts) => ({
    ...n006Run.analysis,
    event_scope: "systemic",
    sector_impacts,
  });
  const client = n006Run.affectedClients[0];
  for (const impacts of [
    [{ sector: "banking", direction: "negative" }],
    [{ sector: "banking", direction: "negative", reason: "ก".repeat(300) }],
  ]) {
    fetchCalls = [];
    const fc = await call({ body: { agent: "factcheck", news: n006, agent1Output: withImpacts(impacts) } });
    assert.equal(fc.status, 200, JSON.stringify(fc.body));
    const sc = await call({ body: { agent: "script", analysis: withImpacts(impacts), client } });
    assert.equal(sc.status, 200, JSON.stringify(sc.body));
  }
  fetchCalls = [];
  for (const reason of ["ก".repeat(301), 5, ["r"]]) {
    const bad = withImpacts([{ sector: "banking", direction: "negative", reason }]);
    const expected = typeof reason === "string" ? 413 : 400;
    assertRejected(await call({ body: { agent: "factcheck", news: n006, agent1Output: bad } }), expected);
    assertRejected(await call({ body: { agent: "script", analysis: bad, client } }), expected);
  }
});

test("script prompt carries the sector reason for each matched holding's sector", async () => {
  const analysis = {
    ...n006Run.analysis,
    sector_impacts: [
      { sector: "banking", direction: "positive", reason: "ดอกเบี้ยสูงขึ้นขยายส่วนต่างดอกเบี้ย" },
      { sector: "property", direction: "negative" },
    ],
  };
  const client = {
    name: "คุณทดสอบ",
    riskProfile: "moderate",
    matchedHoldings: [
      { ticker: "KBANK", name: "ธนาคารกสิกรไทย", sector: "banking", direction: "positive" },
      { ticker: "LH", name: "แลนด์ แอนด์ เฮ้าส์", sector: "property", direction: "negative" },
    ],
  };
  fetchResponder = () => anthropicOk({ script: "เรียนคุณทดสอบ" });
  const out = await call({ body: { agent: "script", analysis, client } });
  assert.equal(out.status, 200);
  const prompt = JSON.parse(fetchCalls[0].init.body).messages[0].content;
  assert.match(prompt, /KBANK \(ธนาคารกสิกรไทย\) — direction: positive — sector mechanism: ดอกเบี้ยสูงขึ้นขยายส่วนต่างดอกเบี้ย/);
  assert.match(prompt, /LH \(แลนด์ แอนด์ เฮ้าส์\) — direction: negative(?! — sector mechanism)/);
});

test("factcheck response passes through the Agent 2 guard; model-written notes discarded", async () => {
  fetchResponder = () =>
    anthropicOk({
      is_valid: false,
      flagged_issues: [],
      adjusted_reasoning: "r",
      factcheck_normalization_notes: ["INJECTED by the model"],
    });
  const out = await call({ body: { agent: "factcheck", news: n006, agent1Output: n006Run.analysis } });
  assert.equal(out.status, 200);
  assert.equal(out.body.is_valid, true);
  assert.deepEqual(out.body.flagged_issues, []);
  assert.equal(out.body.factcheck_normalization_notes.length, 1);
  assert.ok(!out.body.factcheck_normalization_notes.some((n) => n.includes("INJECTED")));

  fetchCalls = [];
  fetchResponder = () => anthropicOk({ is_valid: true, flagged_issues: ["ปัญหา"], adjusted_reasoning: "r" });
  const flagged = await call({ body: { agent: "factcheck", news: n006, agent1Output: n006Run.analysis } });
  assert.equal(flagged.body.is_valid, false);
});

test("impact response is normalized and model-authored notes are discarded", async () => {
  fetchResponder = () =>
    anthropicOk({
      affected_tickers: [],
      affected_sectors: ["Banking"],
      sentiment: "negative",
      event_scope: "systemic",
      sector_impacts: [
        { sector: "banking", direction: "positive" },
        { sector: "property", direction: "negative" },
        { sector: "crypto", direction: "positive" },
      ],
      dislocation_detected: false,
      dislocation_description: "",
      reasoning: "r",
      normalization_notes: ["INJECTED by the model"],
    });
  const out = await call({ body: impactBody() });
  assert.equal(out.status, 200);
  assert.deepEqual(out.body.affected_sectors, ["banking", "property"]);
  assert.deepEqual(out.body.sector_impacts, [
    { sector: "banking", direction: "positive" },
    { sector: "property", direction: "negative" },
  ]);
  assert.ok(!out.body.normalization_notes.some((n) => n.includes("INJECTED")));
  assert.ok(out.body.normalization_notes.some((n) => n.includes("crypto")));
});

test("a long live-mode item (title + ~700-char lede) passes validation", async () => {
  const title = "Central Pattana and Mitsubishi Estate announce $330m mixed-use project".repeat(2);
  const news = adaptLiveItem({
    title,
    content: `${title}\n\n${"lede ".repeat(140)}`,
    link: "https://finance.yahoo.com/news/x",
    source: "Yahoo Finance",
    relatedTickers: ["CPN"],
  });
  const out = await call({
    body: { agent: "impact", news, holdingsSummary: buildHoldingsSummary() },
  });
  assert.equal(out.status, 200);
});

// --- Upstream failures never leak details --------------------------------------------

test("upstream 4xx body is not returned to the caller", async () => {
  fetchResponder = () =>
    new Response('{"type":"error","error":{"message":"SECRET upstream detail"}}', { status: 400 });
  const out = await call({ body: impactBody() });
  assert.equal(out.status, 502);
  assert.deepEqual(out.body, { error: "upstream_error" });
});

test("unparseable model output is not returned to the caller", async () => {
  fetchResponder = () =>
    new Response(JSON.stringify({ content: [{ type: "text", text: "RAW MODEL TEXT not json" }] }), {
      status: 200,
    });
  const out = await call({ body: impactBody() });
  assert.equal(out.status, 502);
  assert.deepEqual(out.body, { error: "invalid_model_output" });
});

test("missing server key -> 500 server_misconfigured, no API call", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const out = await call({ body: impactBody() });
  assertRejected(out, 500);
  assert.equal(out.body.error, "server_misconfigured");
});
