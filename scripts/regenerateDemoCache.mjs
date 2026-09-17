// regenerateDemoCache.mjs — ESCAPE HATCH for the demo-mode cache.
//
// WHAT: Runs the FULL live pipeline once per cached SCENARIO — Agent 1 (impact +
//       dislocation) → deterministic matching/priority → Agent 2 (fact check) →
//       Agent 3 (one script per affected client) — and freezes the results into
//       src/data/cachedDemoRun.js. That cached file is what the demo shows for
//       those news ids, so they never depend on the Claude API (or its
//       determinism) at showtime. See CLAUDE.md hard constraint #5; this extends
//       it from input caching to OUTPUT determinism.
//
//       Two scenarios are cached, and they tell DIFFERENT halves of the story:
//         N006 (Tariff/Gold) — the dislocation money shot. All 10 clients match.
//         N003 (AI exports)  — the priority-filtering shot. Only 3 of 10 match,
//                              which is what makes the "call these first, not all
//                              300" claim visible on screen.
//
// WHEN:  Only when we deliberately want to refresh the demo content (e.g. after
//        editing the Agent prompts or the mock data). This is NOT part of the
//        normal build or the demo path — the demo READS the cache, never writes it.
//
// HOW:   1. .env: ANTHROPIC_API_KEY=... and LIVE_AGENT_ENABLED=true
//        2. npm run dev               (serves /api/claude-agent)
//        3. npm run regen:cache       (AGENT_ENDPOINT_BASE defaults to localhost:5173)
//
// SAFETY: Refuses to overwrite the cache unless EVERY gate passes for EVERY
//         scenario (expected dislocation verdict, fact check clean, all scripts
//         generated, 0 generic, typo guard clean). A bad run aborts WITHOUT
//         touching the committed cache, so a flaky API response can never
//         silently corrupt the demo content. Gates are all-or-nothing across
//         scenarios on purpose: a half-written cache is worse than a stale one.
//
// ACCEPTANCE (what must hold before the new cache is COMMITTED):
//   1. Agent 2 returns is_valid: true for EVERY cached item (enforced — gate).
//   2. A human reviews the before/after client-ranking diff this script prints
//      for each regenerated item. A changed ranking is NOT a failure: agent
//      output varies run to run even at temperature 0 (e.g. N006 healthcare
//      tagged positive in one run and neutral — so not used for matching — in
//      the next), so the reviewer decides whether the new order is acceptable
//      for the demo. If it is not, discard the working-tree change (git) rather
//      than committing it.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeImpact, factCheck, generateAllScripts } from "../src/utils/claudeAPI.js";
import { findAffectedClients, buildHoldingsSummary } from "../src/utils/matching.js";
import { mockNews } from "../src/data/mockNews.js";
import { rankingDiff, formatRankingDiff } from "./rankingDiff.mjs";
import { MAX_SCRIPT_CHARS } from "../api/claude-agent.js";

// The scenarios to freeze. expectDislocation is the verdict we VERIFIED is stable
// for that news item across a 5x stress run — it is a gate, not a hint. If a
// prompt edit flips one of these, the regen aborts and tells us rather than
// quietly changing what the judges see. `null` = no fixed expectation: the
// verdict is Agent 1's call on real market data, so it is printed for human
// review (next to the ranking diff) instead of gated.
const CACHED_SCENARIOS = [
  { id: "N006", expectDislocation: true, note: "Tariff/Gold — dislocation money shot" },
  { id: "N003", expectDislocation: false, note: "AI exports — narrow 3/10 priority filter" },
  { id: "N007", expectDislocation: null, note: "Fed hike Sep 2026 — real market data" },
];
// REGEN_CACHE_PATH lets the test suite point the script at a temp copy; the
// real run always writes the committed cache.
const CACHE_PATH = process.env.REGEN_CACHE_PATH
  ? pathToFileURL(process.env.REGEN_CACHE_PATH)
  : new URL("../src/data/cachedDemoRun.js", import.meta.url);

// Agent calls go through /api/claude-agent (claudeAPI.js no longer talks to
// Anthropic directly), so this script needs a running endpoint rather than the
// key. Default to the local Vite dev server; that server must have
// ANTHROPIC_API_KEY and LIVE_AGENT_ENABLED=true in .env, or every call returns
// 503 live_mode_disabled and the gates below abort without touching the cache.
process.env.AGENT_ENDPOINT_BASE ??= "http://localhost:5173";
console.log(`Using agent endpoint at ${process.env.AGENT_ENDPOINT_BASE}`);

// die — abort the run with exit code 1. It THROWS instead of calling
// process.exit(): on Windows, exiting while fetch's keep-alive sockets are still
// closing trips a libuv assertion (exit 0xC0000409 instead of 1). The handler
// below turns the throw into exitCode 1 and lets the event loop drain.
class AbortRun extends Error {}
const die = (msg) => {
  console.error(`\n✗ ABORTED — ${msg}\n  (cache file left unchanged)\n`);
  throw new AbortRun(msg);
};
process.on("uncaughtException", (err) => {
  if (!(err instanceof AbortRun)) console.error(err);
  process.exitCode = 1;
});

// runScenario — the full pipeline for ONE news item, in the SAME order as
// useDraft (keeps the cache faithful to what the live path would produce).
// Returns the frozen entry plus the problems found; the caller decides to write.
//
// FAIL-FAST: if Agent 2 rejects the analysis (is_valid !== true) the item can
// never be cached, so Agent 3 is NOT called — that saves one paid call per
// matched client. Any thrown error is captured as a problem (not a crash) so the
// partial run can still be written to a failure artifact for review.
async function runScenario({ id, expectDislocation, note }) {
  const news = mockNews.find((n) => n.id === id) || die(`news ${id} not found in mockNews`);
  console.log(`\n─── ${id} — ${note}`);
  console.log(`    ${news.headline}`);

  let analysis = null;
  let agent2Result = null;
  let affectedClients = [];
  let scripts = [];
  let agent3Ran = false;
  const problems = [];

  try {
    console.log("→ Agent 1 (impact + dislocation)…");
    analysis = await analyzeImpact(news, buildHoldingsSummary());

    console.log("→ matching + priority (deterministic)…");
    affectedClients = findAffectedClients(analysis).sort(
      (a, b) => b.priorityScore - a.priorityScore,
    );

    console.log("→ Agent 2 (fact check)…");
    agent2Result = await factCheck(news, analysis);

    if (agent2Result?.is_valid !== true) {
      console.log("  ✗ Agent 2 rejected the analysis — skipping Agent 3 (fail-fast)");
    } else if (affectedClients.length > 0) {
      // Mirror useDraft's script path: Agent 3 consumes the fact-checked
      // reasoning (adjusted_reasoning) when Agent 2 corrected it, else Agent 1's.
      console.log(`→ Agent 3 (${affectedClients.length} client scripts)…`);
      const analysisForScripts = {
        ...analysis,
        reasoning: agent2Result?.adjusted_reasoning || analysis.reasoning,
      };
      agent3Ran = true;
      scripts = await generateAllScripts(analysisForScripts, affectedClients);
    }
  } catch (err) {
    problems.push(`pipeline error: ${err?.message ?? err}`);
  }

  // --- Verification gates — must ALL pass or we do not write the cache ---

  // The dislocation verdict is the scenario's whole reason for existing (N006
  // must find one, N003 must correctly find none). A flip means the demo now
  // tells a different story than the deck claims.
  if (analysis && expectDislocation !== null && !!analysis.dislocation_detected !== expectDislocation) {
    problems.push(
      `dislocation_detected is ${!!analysis.dislocation_detected}, expected ${expectDislocation}`,
    );
  }

  // A cached scenario freezes the fact-check result too, so a flagged draft would
  // put a permanent amber warning in front of the judges.
  if (agent2Result && agent2Result.is_valid !== true) {
    problems.push(
      `Agent 2 is_valid is ${agent2Result.is_valid}, expected true ` +
        `(flagged: ${JSON.stringify(agent2Result.flagged_issues ?? [])})`,
    );
  }

  if (analysis && affectedClients.length === 0) problems.push("no affected clients matched");

  let generic = 0;
  let typos = 0;
  let tooLong = 0;
  if (agent3Ran) {
    const failed = scripts.filter((s) => !s.ok);
    if (failed.length) problems.push(`${failed.length} script(s) failed to generate`);
    for (const s of scripts) {
      if (!s.ok) continue;
      const client = affectedClients.find((c) => c.clientId === s.clientId);
      const tickers = client.matchedHoldings.map((h) => h.ticker);
      if (!tickers.some((t) => s.script.includes(t))) generic++;
      if (s.script.includes("สภาพคล็อง")) typos++; // typo guard must have fired
      if (s.length_exceeded) tooLong++;
    }
    if (generic) problems.push(`${generic} generic script(s) (no matched ticker named)`);
    if (typos) problems.push(`${typos} script(s) still contain the known typo`);
    // The server flags scripts over MAX_SCRIPT_CHARS (never truncating them); a
    // flagged script is not fit to freeze into the demo.
    if (tooLong) problems.push(`${tooLong} script(s) exceed the character cap (length_exceeded)`);
  }

  console.log("  Verification:");
  if (analysis) {
    console.log(
      `    dislocation_detected : ${!!analysis.dislocation_detected} ` +
        (expectDislocation === null ? "(no fixed expectation — REVIEW)" : `(expected ${expectDislocation})`),
    );
  }
  console.log(`    Agent 2 is_valid     : ${agent2Result?.is_valid}`);
  console.log(`    affected clients     : ${affectedClients.length}`);
  console.log(
    `    scripts generated    : ${agent3Ran ? `${scripts.filter((s) => s.ok).length}/${scripts.length}` : "skipped"}`,
  );
  console.log(`    generic scripts      : ${generic}`);
  console.log(`    uncorrected typos    : ${typos}`);
  console.log(`    over length cap      : ${tooLong}`);
  if (scripts.length) console.log(`    script lengths       : ${scriptLengths(scripts)}`);

  const entry = {
    newsId: id,
    generatedAt: new Date().toISOString(),
    analysis,
    agent2Result,
    affectedClients,
    scripts,
  };
  return { entry, problems };
}

const scriptLengths = (scripts) =>
  scripts
    .map((s) => `${s.clientId} ${s.ok ? s.script.length : "failed"}${s.length_exceeded ? " (OVER CAP)" : ""}`)
    .join(", ");

// writeFailureArtifact — on ANY failure, keep what the run produced (Agent 1,
// Agent 2, scripts so far) so the reviewer can see why without paying for a
// re-run. Written under .regen-failed/ (gitignored); REGEN_FAILED_DIR overrides
// it for tests. Never touches the cache file.
function writeFailureArtifact(entry, problems) {
  const dir = process.env.REGEN_FAILED_DIR
    ? process.env.REGEN_FAILED_DIR
    : fileURLToPath(new URL("../.regen-failed/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `${entry.newsId}-${stamp}.json`);
  const artifact = {
    newsId: entry.newsId,
    failedAt: new Date().toISOString(),
    problems,
    analysis: entry.analysis,
    agent2Result: entry.agent2Result,
    rankedClients: entry.affectedClients.map((c) => ({
      clientId: c.clientId,
      priorityScore: c.priorityScore,
      matchedHoldings: c.matchedHoldings.map((h) => `${h.ticker}:${h.matchedBy ?? "?"}:${h.direction ?? "?"}`),
    })),
    scripts: entry.scripts.map((sc) => ({ ...sc, length: sc.script?.length ?? null })),
  };
  writeFileSync(file, JSON.stringify(artifact, null, 2), "utf8");
  return file;
}

// loadExistingCache — read the currently committed cache so a selective regen can
// preserve the scenarios it is not touching. Tolerates the legacy single-scenario
// shape (export const cachedDemoRun = {...}) so the first multi-scenario run can
// migrate it, and a missing/unparseable file (returns {} — we regenerate anyway).
async function loadExistingCache() {
  try {
    const mod = await import(`${CACHE_PATH.href}?t=${Date.now()}`);
    if (mod.cachedDemoRuns) return { ...mod.cachedDemoRuns };
    const legacy = mod.cachedDemoRun ?? mod.default;
    return legacy?.newsId ? { [legacy.newsId]: legacy } : {};
  } catch {
    return {};
  }
}

// Optional CLI filter: `npm run regen:cache -- --only N007` (or the older bare
// form `... -- N007`) regenerates ONLY that item and preserves every other
// cached scenario verbatim — their serialized JSON is unchanged; only the file's
// header comment (timestamp + summary) is rewritten. `--only` may repeat. Why
// this exists: Agent output is NOT reproducible even at temperature 0
// (measured — the same news re-run returns reworded text and a different
// fact-check verdict), so a blanket regen silently replaces demo content that
// was already reviewed. Pass no args to regenerate everything from scratch.
function parseOnly(argv) {
  const ids = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--only") {
      const id = argv[++i];
      if (!id || id.startsWith("-")) die("--only needs a news id, e.g. --only N007");
      ids.push(id);
    } else if (arg.startsWith("--only=")) {
      ids.push(arg.slice("--only=".length));
    } else if (arg.startsWith("-")) {
      die(`unknown option: ${arg}`);
    } else {
      ids.push(arg);
    }
  }
  return ids;
}
const only = parseOnly(process.argv.slice(2));
const targets = only.length
  ? CACHED_SCENARIOS.filter((s) => only.includes(s.id))
  : CACHED_SCENARIOS;

if (only.length) {
  const unknown = only.filter((id) => !CACHED_SCENARIOS.some((s) => s.id === id));
  if (unknown.length) die(`unknown scenario id(s): ${unknown.join(", ")}`);
}

console.log(
  `Regenerating demo cache for: ${targets.map((s) => s.id).join(", ")}` +
    (only.length ? `  (preserving all other cached scenarios)` : ""),
);

// Run every target BEFORE writing anything — all-or-nothing (see SAFETY above).
const results = [];
for (const scenario of targets) {
  results.push({ scenario, ...(await runScenario(scenario)) });
}

const allProblems = results.flatMap(({ scenario, problems }) =>
  problems.map((p) => `[${scenario.id}] ${p}`),
);
if (allProblems.length) {
  for (const { entry, problems } of results) {
    if (problems.length) console.error(`  failure artifact: ${writeFailureArtifact(entry, problems)}`);
  }
  die("verification failed:\n  - " + allProblems.join("\n  - "));
}

// --- Serialize to a committed, human-readable data module -----------------------
// Keyed by news id so useDraft can look a scenario up directly. useDraft asserts
// at boot that every key here still exists in mockNews.
// Freshly generated entries overlay preserved ones; key order follows
// CACHED_SCENARIOS so the committed file diffs cleanly run to run.
const previous = await loadExistingCache();
const preserved = only.length ? previous : {};
const regenerated = Object.fromEntries(results.map(({ entry }) => [entry.newsId, entry]));

// Review block per regenerated item, printed BEFORE the file is written so the
// reviewer sees what the demo will show (acceptance criterion 2 above): the
// dislocation verdict (the only record of it for items with no fixed
// expectation), sector directions + reasons, normalization notes, the Agent 2
// verdict, and the before/after ranking (a new item shows its new ranking).
console.log("\nReview (check before committing the new cache):");
for (const { scenario, entry } of results) {
  const a = entry.analysis;
  const isNew = !previous[entry.newsId];
  console.log(`\n  ${entry.newsId}${isNew ? " (new item)" : ""}`);
  console.log(
    `    dislocation_detected    : ${!!a.dislocation_detected}` +
      (scenario.expectDislocation === null ? "  (no fixed expectation — REVIEW)" : ""),
  );
  console.log(`    dislocation_description : ${a.dislocation_description || "(none)"}`);
  console.log(`    event_scope             : ${a.event_scope ?? "(none)"}`);
  for (const s of a.sector_impacts ?? []) {
    console.log(`      ${s.direction.padEnd(8)} ${s.sector.padEnd(11)} ${s.reason ?? "(no reason)"}`);
  }
  console.log(`    normalization_notes     : ${JSON.stringify(a.normalization_notes ?? [])}`);
  console.log(
    `    Agent 2                 : is_valid=${entry.agent2Result?.is_valid} ` +
      `issues=${JSON.stringify(entry.agent2Result?.flagged_issues ?? [])} ` +
      `guard=${JSON.stringify(entry.agent2Result?.factcheck_normalization_notes ?? [])}`,
  );
  console.log(`    script lengths (cap ${MAX_SCRIPT_CHARS}) : ${scriptLengths(entry.scripts)}`);
  const rows = rankingDiff(previous[entry.newsId]?.affectedClients, entry.affectedClients);
  console.log(formatRankingDiff(entry.newsId, rows));
}
const merged = { ...preserved, ...regenerated };
const cache = Object.fromEntries(
  CACHED_SCENARIOS.filter((s) => merged[s.id]).map((s) => [s.id, merged[s.id]]),
);

for (const id of Object.keys(cache)) {
  const kept = !regenerated[id];
  console.log(`  ${kept ? "preserved" : "regenerated"}: ${id}`);
}

const summary = Object.values(cache)
  .map(
    (entry) =>
      `//   ${entry.newsId}: ${entry.affectedClients.length} clients, ` +
      `${entry.scripts.length} scripts, dislocation=${!!entry.analysis.dislocation_detected}`,
  )
  .join("\n");

const file = `// cachedDemoRun.js — AUTO-GENERATED. DO NOT EDIT BY HAND.
//
// Frozen output of the full pipeline (Agent 1 + matching/priority + Agent 2 +
// per-client Agent 3 scripts) for each cached demo scenario, keyed by news id.
// This is the EXACT, fixed content the demo shows for these news items, so they
// are deterministic and never call the Claude API at showtime:
//
${summary}
//
// Every other news id still runs the live pipeline. useDraft.js asserts at boot
// that each key below still exists in mockNews — a renamed id fails loudly there
// instead of silently falling back to the live API mid-demo.
//
// Regenerate with:  npm run regen:cache   (see scripts/regenerateDemoCache.mjs)
// Generated:        ${new Date().toISOString()}
//
// Verified at generation, per scenario: expected dislocation verdict (where one
// is fixed; otherwise human-reviewed), Agent 2 is_valid=true, all scripts
// generated, 0 generic, typo guard applied, ranking diff reviewed.

export const cachedDemoRuns = ${JSON.stringify(cache, null, 2)};

export default cachedDemoRuns;
`;

writeFileSync(CACHE_PATH, file, "utf8");
// Count the whole COMMITTED cache, not just this run's regenerated entries —
// a selective regen writes preserved scenarios back out too.
const entries = Object.values(cache);
const totalScripts = entries.reduce((n, e) => n + e.scripts.length, 0);
console.log(
  `\n✓ Wrote ${entries.length}-scenario cache (${entries.map((e) => e.newsId).join(", ")}; ` +
    `${totalScripts} scripts total) → src/data/cachedDemoRun.js\n` +
    `  Review the ranking diff above (and \`git diff src/data/cachedDemoRun.js\`) before committing.\n`,
);
