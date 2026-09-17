// Client transport tests for src/utils/claudeAPI.js (postAgent retry policy).
//
// fetch is stubbed — nothing leaves the process. Confirms that HTTP errors
// (4xx, the 503 kill switch, 5xx) are NOT retried client-side, and that only a
// network-level failure is.
//
// Run: npm test

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { analyzeImpact, generateAllScripts, LIVE_MODE_DISABLED } from "../src/utils/claudeAPI.js";

const realFetch = globalThis.fetch;
let calls;

beforeEach(() => {
  calls = 0;
  process.env.AGENT_ENDPOINT_BASE = "http://localhost:5173";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.AGENT_ENDPOINT_BASE;
});

function stubFetch(makeResponse) {
  globalThis.fetch = async () => {
    calls++;
    return makeResponse();
  };
}

test("503 live_mode_disabled: no retry, error carries code and a readable message", async () => {
  stubFetch(() => new Response(JSON.stringify({ error: LIVE_MODE_DISABLED }), { status: 503 }));
  await assert.rejects(analyzeImpact({}, ""), (err) => {
    assert.equal(err.status, 503);
    assert.equal(err.code, LIVE_MODE_DISABLED);
    assert.match(err.message, /live analysis/);
    return true;
  });
  assert.equal(calls, 1);
});

test("4xx: no retry, code surfaced", async () => {
  stubFetch(() => new Response(JSON.stringify({ error: "unknown_agent" }), { status: 400 }));
  await assert.rejects(analyzeImpact({}, ""), (err) => {
    assert.equal(err.status, 400);
    assert.equal(err.code, "unknown_agent");
    return true;
  });
  assert.equal(calls, 1);
});

test("5xx with a non-JSON body: no retry (body is read only once)", async () => {
  // Regression: res.json() then res.text() threw a TypeError ("body used"),
  // which the retry loop mistook for a network failure.
  stubFetch(() => new Response("<html>504 Gateway Timeout</html>", { status: 504 }));
  await assert.rejects(analyzeImpact({}, ""), (err) => {
    assert.equal(err.status, 504);
    assert.equal(err.code, null);
    return true;
  });
  assert.equal(calls, 1);
});

test("network failure IS retried (max 2 retries)", async () => {
  globalThis.fetch = async () => {
    calls++;
    throw new TypeError("fetch failed");
  };
  await assert.rejects(analyzeImpact({}, ""), TypeError);
  assert.equal(calls, 3);
});

test("generateAllScripts carries length_exceeded only when the server set it", async () => {
  stubFetch(() => {
    const n = calls; // 1-based after increment
    const body = n === 1 ? { script: "long", length_exceeded: true } : { script: "short" };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const clients = [
    { clientId: "A", name: "A", riskProfile: "moderate" },
    { clientId: "B", name: "B", riskProfile: "moderate" },
  ];
  const out = await generateAllScripts({ sentiment: "neutral" }, clients);
  assert.equal(out[0].length_exceeded, true);
  assert.equal(out[0].script, "long");
  assert.equal("length_exceeded" in out[1], false);
});
