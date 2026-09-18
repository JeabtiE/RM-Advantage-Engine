// End-to-end tests of `regenerateDemoCache.mjs --only <id>` and
// `--apply-cio-review <id>` against a STUBBED endpoint. The real regen script
// runs in a child process, pointed at:
//   - a local HTTP server that wraps the real api/claude-agent.js handler, whose
//     Anthropic fetch is stubbed in THIS process (no network, no key), and
//   - a temp copy of the cache (REGEN_CACHE_PATH), so the committed
//     src/data/cachedDemoRun.js is never touched.
//
// Run: npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import handler, { MAX_SCRIPT_CHARS } from "../api/claude-agent.js";

const run = promisify(execFile);
const REPO = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(REPO, "scripts", "regenerateDemoCache.mjs");
const REAL_CACHE = join(REPO, "src", "data", "cachedDemoRun.js");

const realFetch = globalThis.fetch;
let server;
let base;
let tmp;
let anthropicCalls = 0;
let agent1Calls = 0;
let agent2Calls = 0;
let agent3Calls = 0;
// Per-test stub behaviour: "ok" | "a2-invalid" | "too-long".
let mode = "ok";
const resetStub = (m) => {
  mode = m;
  anthropicCalls = 0;
  agent1Calls = 0;
  agent2Calls = 0;
  agent3Calls = 0;
};

const reply = (obj) =>
  new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(obj) }] }), {
    status: 200,
  });

// Canned model output, chosen by which agent's system prompt is being sent.
function fakeAnthropic(init) {
  anthropicCalls++;
  const { system, messages } = JSON.parse(init.body);
  const user = messages[0].content;
  if (system.includes("buy-side investment strategist")) {
    agent1Calls++;
    return reply({
      affected_tickers: [],
      affected_sectors: ["banking", "property"],
      sentiment: "neutral",
      event_scope: "systemic",
      sector_impacts: [
        { sector: "banking", direction: "positive", reason: "ดอกเบี้ยสูงขึ้นขยายส่วนต่างดอกเบี้ย" },
        { sector: "property", direction: "negative", reason: "ต้นทุนสินเชื่อสูงขึ้น" },
      ],
      dislocation_detected: false,
      dislocation_description: "",
      reasoning: "stub",
    });
  }
  if (system.includes("fact checker")) {
    agent2Calls++;
    return mode === "a2-invalid"
      ? reply({ is_valid: false, flagged_issues: ["stub issue"], adjusted_reasoning: "stub" })
      : reply({ is_valid: true, flagged_issues: [], adjusted_reasoning: "stub" });
  }
  // Agent 3: name the first matched ticker so the "generic script" gate passes.
  agent3Calls++;
  const ticker = user.match(/portfolio: ([A-Z0-9]+) \(/)?.[1] ?? "NONE";
  const pad = mode === "too-long" ? "ก".repeat(MAX_SCRIPT_CHARS) : "";
  return reply({ script: `เรียนคุณลูกค้า หุ้น ${ticker} ในพอร์ต (stub)${pad}` });
}

before(async () => {
  process.env.LIVE_AGENT_ENABLED = "true";
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.anthropic.com/")) return fakeAnthropic(init);
    return realFetch(url, init);
  };

  // Minimal Vercel-style shim around the real handler (same as the Vite dev plugin).
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const shim = {
        setHeader: (k, v) => (res.setHeader(k, v), shim),
        status: (code) => ((res.statusCode = code), shim),
        json: (body) => (res.setHeader("content-type", "application/json"), res.end(JSON.stringify(body)), shim),
      };
      await handler({ method: req.method, headers: req.headers, body: raw ? JSON.parse(raw) : undefined }, shim);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;

  tmp = mkdtempSync(join(tmpdir(), "regen-only-"));
});

after(() => {
  globalThis.fetch = realFetch;
  delete process.env.LIVE_AGENT_ENABLED;
  delete process.env.ANTHROPIC_API_KEY;
  server?.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

// The serialized JSON of one entry as it appears in a cache file.
async function entryJson(file, id) {
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}-${Math.random()}`);
  return JSON.stringify(mod.cachedDemoRuns[id], null, 2);
}

const lf = (s) => s.replace(/\r\n/g, "\n");

test("--only N007 adds N007 and leaves every other cached item byte-for-byte unchanged", async () => {
  resetStub("ok");
  // Start from a cache WITHOUT N007 (the committed cache now contains it), in the
  // same serialized form the script writes, so N007 is a genuinely new item.
  const cache = join(tmp, "cachedDemoRun.mjs");
  const committed = await import(`${pathToFileURL(REAL_CACHE).href}?t=${Date.now()}`);
  const { N006, N003 } = committed.cachedDemoRuns;
  writeFileSync(
    cache,
    `export const cachedDemoRuns = ${JSON.stringify({ N006, N003 }, null, 2)};\n\nexport default cachedDemoRuns;\n`,
  );
  const originalText = lf(readFileSync(cache, "utf8"));

  const { stdout } = await run(process.execPath, [SCRIPT, "--only", "N007"], {
    cwd: REPO,
    env: { ...process.env, AGENT_ENDPOINT_BASE: base, REGEN_CACHE_PATH: cache },
  });

  const written = lf(readFileSync(cache, "utf8"));
  for (const id of ["N006", "N003"]) {
    const block = await entryJson(REAL_CACHE, id);
    assert.ok(originalText.includes(`"${id}": ${block.replace(/\n/g, "\n  ")}`), `${id} located in original`);
    assert.ok(written.includes(`"${id}": ${block.replace(/\n/g, "\n  ")}`), `${id} unchanged in output`);
    assert.equal(await entryJson(cache, id), block, `${id} deep-equal after regen`);
  }

  const mod = await import(`${pathToFileURL(cache).href}?t=${Date.now()}`);
  assert.deepEqual(Object.keys(mod.cachedDemoRuns), ["N006", "N003", "N007"]);
  const n007 = mod.cachedDemoRuns.N007;
  assert.equal(n007.agent2Result.is_valid, true);
  assert.ok(n007.affectedClients.length > 0);
  assert.equal(n007.scripts.length, n007.affectedClients.length);

  // Review output: dislocation verdict + new ranking, with no fixed expectation.
  assert.match(stdout, /N007 \(new item\)/);
  assert.match(stdout, /dislocation_detected\s+: false\s+\(no fixed expectation — REVIEW\)/);
  assert.match(stdout, /Ranking diff N007/);
  assert.match(stdout, /preserved: N006/);
  assert.match(stdout, /regenerated: N007/);
  assert.equal(anthropicCalls, 2 + n007.affectedClients.length);
  assert.match(stdout, /script lengths \(cap 600\)/);
});

// Runs the regen script for N007 against a fresh cache copy and failure dir;
// the script is expected to exit 1 without touching the cache.
async function failingRun(label) {
  const cache = join(tmp, `${label}.mjs`);
  const failedDir = join(tmp, `${label}-failed`);
  copyFileSync(REAL_CACHE, cache);
  const before = readFileSync(cache, "utf8");
  let err;
  try {
    await run(process.execPath, [SCRIPT, "--only", "N007"], {
      cwd: REPO,
      env: { ...process.env, AGENT_ENDPOINT_BASE: base, REGEN_CACHE_PATH: cache, REGEN_FAILED_DIR: failedDir },
    });
  } catch (e) {
    err = e;
  }
  assert.equal(err?.code, 1, "regen must fail");
  assert.equal(readFileSync(cache, "utf8"), before, "cache file untouched");
  const files = readdirSync(failedDir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^N007-.*\.json$/);
  const artifact = JSON.parse(readFileSync(join(failedDir, files[0]), "utf8"));
  return { err, artifact };
}

test("Agent 2 invalid -> zero Agent 3 calls, nothing written to the cache, failure artifact saved", async () => {
  resetStub("a2-invalid");
  const { err, artifact } = await failingRun("a2-invalid");
  assert.equal(agent3Calls, 0);
  assert.equal(anthropicCalls, 2);
  assert.match(err.stdout, /skipping Agent 3 \(fail-fast\)/);
  assert.equal(artifact.agent2Result.is_valid, false);
  assert.equal(artifact.analysis.event_scope, "systemic");
  assert.deepEqual(artifact.scripts, []);
  assert.ok(artifact.rankedClients.length > 0);
  assert.ok(artifact.problems.some((p) => p.includes("Agent 2 is_valid is false")));
});

test("any script over the length cap -> regen fails, cache untouched, scripts kept in the artifact", async () => {
  resetStub("too-long");
  const { artifact } = await failingRun("too-long");
  assert.ok(agent3Calls > 0);
  assert.ok(artifact.scripts.length > 0);
  assert.ok(artifact.scripts.every((sc) => sc.length_exceeded === true && sc.length > MAX_SCRIPT_CHARS));
  assert.ok(artifact.problems.some((p) => p.includes("exceed the character cap")));
});

test("--only with an unknown id or a missing value aborts without writing", async () => {
  resetStub("ok");
  const cache = join(tmp, "untouched.mjs");
  copyFileSync(REAL_CACHE, cache);
  const before = readFileSync(cache, "utf8");
  for (const args of [["--only", "N999"], ["--only"], ["--bogus"]]) {
    await assert.rejects(
      run(process.execPath, [SCRIPT, ...args], {
        cwd: REPO,
        env: { ...process.env, AGENT_ENDPOINT_BASE: base, REGEN_CACHE_PATH: cache },
      }),
      (err) => err.code === 1,
    );
  }
  assert.equal(readFileSync(cache, "utf8"), before);
});

// --- --apply-cio-review ------------------------------------------------------------

const committedCache = async () =>
  (await import(`${pathToFileURL(REAL_CACHE).href}?t=${Date.now()}-${Math.random()}`)).cachedDemoRuns;

// Runs `--apply-cio-review N007` with the given review object (or raw file
// text) in a temp review dir against a temp copy of the committed cache.
async function applyRun(label, review, extraArgs = []) {
  const cache = join(tmp, `${label}.mjs`);
  const reviewDir = join(tmp, `${label}-reviews`);
  const failedDir = join(tmp, `${label}-failed`);
  copyFileSync(REAL_CACHE, cache);
  mkdirSync(reviewDir, { recursive: true });
  writeFileSync(
    join(reviewDir, "N007.json"),
    typeof review === "string" ? review : JSON.stringify(review, null, 2),
  );
  const before = readFileSync(cache, "utf8");
  let result;
  try {
    result = { code: 0, ...(await run(process.execPath, [SCRIPT, "--apply-cio-review", "N007", ...extraArgs], {
      cwd: REPO,
      env: {
        ...process.env,
        AGENT_ENDPOINT_BASE: base,
        REGEN_CACHE_PATH: cache,
        CIO_REVIEW_DIR: reviewDir,
        REGEN_FAILED_DIR: failedDir,
      },
    })) };
  } catch (err) {
    result = { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
  return { ...result, cache, before, after: readFileSync(cache, "utf8"), failedDir };
}

const readyReview = async (changes) => {
  const cached = (await committedCache()).N007.analysis;
  return {
    reviewer: "CIO (test)",
    reviewedAt: "2026-09-18T03:00:00.000Z",
    changes: changes(cached),
  };
};

test("--apply-cio-review: applies edits, regenerates Agent 3 only, keeps the AI originals, prints the ranking diff", async () => {
  resetStub("ok");
  const review = await readyReview((a) => [
    { path: "dislocation_description", before: a.dislocation_description, after: "ฉบับที่ CIO แก้ไข", rationale: "ตัดคำชี้นำ" },
    {
      path: "sector_impacts[technology].direction",
      before: a.sector_impacts.find((s) => s.sector === "technology").direction,
      after: "neutral",
      rationale: "ทดสอบ",
    },
  ]);
  const r = await applyRun("apply-ok", review);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(agent1Calls, 0, "Agent 1 never called");
  assert.equal(agent2Calls, 0, "Agent 2 never called");

  const committed = await committedCache();
  const written = (await import(`${pathToFileURL(r.cache).href}?t=${Date.now()}`)).cachedDemoRuns;
  const n007 = written.N007;
  // AI originals preserved exactly; other scenarios untouched.
  assert.deepEqual(n007.analysis, committed.N007.analysis);
  assert.deepEqual(n007.agent2Result, committed.N007.agent2Result);
  assert.deepEqual(written.N006, committed.N006);
  assert.deepEqual(written.N003, committed.N003);
  // Review recorded; reviewed analysis re-normalized (neutral technology dropped).
  assert.equal(n007.cioReview.reviewer, "CIO (test)");
  assert.equal(n007.cioReview.changes.length, 2);
  assert.equal(n007.reviewedAnalysis.dislocation_description, "ฉบับที่ CIO แก้ไข");
  assert.ok(!n007.reviewedAnalysis.affected_sectors.includes("technology"));
  assert.ok(n007.reviewedAnalysis.normalization_notes.some((x) => x.includes("technology")));
  // Matching re-ran: KCE/HANA (sector matches) are gone; DELTA stays (ticker).
  const tickers = n007.affectedClients.flatMap((c) => c.matchedHoldings.map((h) => h.ticker));
  assert.ok(!tickers.includes("KCE") && !tickers.includes("HANA"));
  assert.ok(tickers.includes("DELTA"));
  assert.equal(agent3Calls, n007.affectedClients.length);
  assert.equal(n007.scripts.length, n007.affectedClients.length);
  // Review output.
  assert.match(r.stdout, /Agent 1\/2 are NOT called/);
  assert.match(r.stdout, /CIO review\s+: CIO \(test\)/);
  assert.match(r.stdout, /Ranking diff N007/);
  assert.match(r.stdout, /client\(s\) changed — REVIEW/);
  assert.match(r.stdout, /fact check of the ORIGINAL AI analysis/);
});

for (const [label, makeChanges, expected] of [
  [
    "disallowed path",
    (a) => [{ path: "affected_tickers", before: "x", after: "y", rationale: "r" }],
    /not allowed/,
  ],
  [
    "stale before",
    (a) => [{ path: "reasoning", before: `${a.reasoning} (edited elsewhere)`, after: "ใหม่", rationale: "r" }],
    /stale/,
  ],
  [
    "open team decision",
    (a) => [{
      path: "sector_impacts[technology].direction",
      before: "negative",
      after: "TEAM DECISION NEEDED",
      rationale: "r",
    }],
    /not ready to apply/,
  ],
]) {
  test(`--apply-cio-review rejects a ${label}: exit 1, zero agent calls, cache untouched`, async () => {
    resetStub("ok");
    const review = await readyReview(makeChanges);
    const r = await applyRun(`reject-${label.replace(/\W+/g, "-")}`, review);
    assert.equal(r.code, 1);
    assert.match(r.stderr, expected);
    assert.equal(anthropicCalls, 0);
    assert.equal(r.after, r.before);
  });
}

test("--apply-cio-review refuses the committed DRAFT N007 review", async () => {
  resetStub("ok");
  const draftText = readFileSync(join(REPO, "src", "data", "cioReviews", "N007.json"), "utf8");
  const r = await applyRun("draft", draftText);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /reviewer is still a draft/);
  assert.match(r.stderr, /TEAM DECISION NEEDED/);
  assert.equal(anthropicCalls, 0);
  assert.equal(r.after, r.before);
});

test("--apply-cio-review keeps the length gate: over-long scripts fail without writing", async () => {
  resetStub("too-long");
  const review = await readyReview((a) => [
    { path: "reasoning", before: a.reasoning, after: "เหตุผลที่ CIO แก้ไข", rationale: "r" },
  ]);
  const r = await applyRun("apply-too-long", review);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /exceed the character cap/);
  assert.equal(agent1Calls + agent2Calls, 0);
  assert.ok(agent3Calls > 0);
  assert.equal(r.after, r.before);
  assert.equal(readdirSync(r.failedDir).length, 1);
});

test("--apply-cio-review cannot be combined with --only", async () => {
  resetStub("ok");
  const review = await readyReview((a) => [{ path: "reasoning", before: a.reasoning, after: "x", rationale: "r" }]);
  const r = await applyRun("combo", review, ["--only", "N006"]);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /cannot be combined/);
  assert.equal(anthropicCalls, 0);
});
