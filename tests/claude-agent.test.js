// Endpoint validation tests for api/claude-agent.js.
//
// NEVER calls the real Anthropic API: globalThis.fetch is replaced for every
// test with a stub that records calls and answers with a canned response. Tests
// that expect a rejection also assert the stub was never reached.
//
// Run: npm test

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import handler from "../api/claude-agent.js";
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
