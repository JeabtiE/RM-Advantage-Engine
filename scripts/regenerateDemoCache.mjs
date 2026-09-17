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

import { writeFileSync } from "node:fs";
import { analyzeImpact, factCheck, generateAllScripts } from "../src/utils/claudeAPI.js";
import { findAffectedClients, buildHoldingsSummary } from "../src/utils/matching.js";
import { mockNews } from "../src/data/mockNews.js";
import { rankingDiff, formatRankingDiff } from "./rankingDiff.mjs";

// The scenarios to freeze. expectDislocation is the verdict we VERIFIED is stable
// for that news item across a 5x stress run — it is a gate, not a hint. If a
// prompt edit flips one of these, the regen aborts and tells us rather than
// quietly changing what the judges see.
const CACHED_SCENARIOS = [
  { id: "N006", expectDislocation: true, note: "Tariff/Gold — dislocation money shot" },
  { id: "N003", expectDislocation: false, note: "AI exports — narrow 3/10 priority filter" },
];
const CACHE_PATH = new URL("../src/data/cachedDemoRun.js", import.meta.url);

// Agent calls go through /api/claude-agent (claudeAPI.js no longer talks to
// Anthropic directly), so this script needs a running endpoint rather than the
// key. Default to the local Vite dev server; that server must have
// ANTHROPIC_API_KEY and LIVE_AGENT_ENABLED=true in .env, or every call returns
// 503 live_mode_disabled and the gates below abort without touching the cache.
process.env.AGENT_ENDPOINT_BASE ??= "http://localhost:5173";
console.log(`Using agent endpoint at ${process.env.AGENT_ENDPOINT_BASE}`);

const die = (msg) => {
  console.error(`\n✗ ABORTED — ${msg}\n  (cache file left unchanged)\n`);
  process.exit(1);
};

// runScenario — the full pipeline for ONE news item, in the SAME order as
// useDraft (keeps the cache faithful to what the live path would produce).
// Returns the frozen entry plus the problems found; the caller decides to write.
async function runScenario({ id, expectDislocation, note }) {
  const news = mockNews.find((n) => n.id === id) || die(`news ${id} not found in mockNews`);
  console.log(`\n─── ${id} — ${note}`);
  console.log(`    ${news.headline}`);

  console.log("→ Agent 1 (impact + dislocation)…");
  const analysis = await analyzeImpact(news, buildHoldingsSummary());

  console.log("→ matching + priority (deterministic)…");
  const affectedClients = findAffectedClients(analysis).sort(
    (a, b) => b.priorityScore - a.priorityScore,
  );

  console.log("→ Agent 2 (fact check)…");
  const agent2Result = await factCheck(news, analysis);

  // Mirror useDraft's script path: Agent 3 consumes the fact-checked reasoning
  // (adjusted_reasoning) when Agent 2 corrected it, else Agent 1's original.
  console.log(`→ Agent 3 (${affectedClients.length} client scripts)…`);
  const analysisForScripts = {
    ...analysis,
    reasoning: agent2Result?.adjusted_reasoning || analysis.reasoning,
  };
  const scripts = await generateAllScripts(analysisForScripts, affectedClients);

  // --- Verification gates — must ALL pass or we do not write the cache ---
  const problems = [];

  // The dislocation verdict is the scenario's whole reason for existing (N006
  // must find one, N003 must correctly find none). A flip means the demo now
  // tells a different story than the deck claims.
  if (!!analysis.dislocation_detected !== expectDislocation) {
    problems.push(
      `dislocation_detected is ${!!analysis.dislocation_detected}, expected ${expectDislocation}`,
    );
  }

  // A cached scenario freezes the fact-check result too, so a flagged draft would
  // put a permanent amber warning in front of the judges. Verified stable at 5x
  // for both scenarios — gate it so a prompt edit cannot slip one in unnoticed.
  if (agent2Result?.is_valid !== true) {
    problems.push(
      `Agent 2 is_valid is ${agent2Result?.is_valid}, expected true ` +
        `(flagged: ${JSON.stringify(agent2Result?.flagged_issues ?? [])})`,
    );
  }

  if (affectedClients.length === 0) problems.push("no affected clients matched");

  const failed = scripts.filter((s) => !s.ok);
  if (failed.length) problems.push(`${failed.length} script(s) failed to generate`);

  let generic = 0;
  let typos = 0;
  for (const s of scripts) {
    if (!s.ok) continue;
    const client = affectedClients.find((c) => c.clientId === s.clientId);
    const tickers = client.matchedHoldings.map((h) => h.ticker);
    if (!tickers.some((t) => s.script.includes(t))) generic++;
    if (s.script.includes("สภาพคล็อง")) typos++; // typo guard must have fired
  }
  if (generic) problems.push(`${generic} generic script(s) (no matched ticker named)`);
  if (typos) problems.push(`${typos} script(s) still contain the known typo`);

  console.log("  Verification:");
  console.log(`    dislocation_detected : ${!!analysis.dislocation_detected} (expected ${expectDislocation})`);
  console.log(`    Agent 2 is_valid     : ${agent2Result?.is_valid}`);
  console.log(`    affected clients     : ${affectedClients.length}`);
  console.log(`    scripts generated    : ${scripts.filter((s) => s.ok).length}/${scripts.length}`);
  console.log(`    generic scripts      : ${generic}`);
  console.log(`    uncorrected typos    : ${typos}`);

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

// Optional CLI filter: `node scripts/regenerateDemoCache.mjs N003` regenerates
// ONLY N003 and preserves every other cached scenario verbatim. Why this exists:
// Agent output is NOT reproducible even at temperature 0 (measured — the same
// news re-run returns reworded text and a different fact-check verdict), so a
// blanket regen silently replaces demo content that was already reviewed. Pass
// no args to regenerate everything from scratch.
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
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
if (allProblems.length) die("verification failed:\n  - " + allProblems.join("\n  - "));

// --- Serialize to a committed, human-readable data module -----------------------
// Keyed by news id so useDraft can look a scenario up directly. useDraft asserts
// at boot that every key here still exists in mockNews.
// Freshly generated entries overlay preserved ones; key order follows
// CACHED_SCENARIOS so the committed file diffs cleanly run to run.
const previous = await loadExistingCache();
const preserved = only.length ? previous : {};
const regenerated = Object.fromEntries(results.map(({ entry }) => [entry.newsId, entry]));

// Before/after ranking per regenerated item, printed BEFORE the file is written
// so the reviewer sees what the demo will show (acceptance criterion 2 above).
console.log("\nClient ranking changes (review before committing the new cache):");
for (const { entry } of results) {
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
// Verified at generation, per scenario: expected dislocation verdict, Agent 2
// is_valid=true, all scripts generated, 0 generic, typo guard applied.

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
