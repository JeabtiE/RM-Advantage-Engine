// test-factcheck-5x.js — verify the Agent 1 prompt fix eliminates the Agent 2
// false-flag on the Tariff/Gold case (N006). Runs analyzeImpact -> factCheck
// 5 times and reports is_valid each run. On any is_valid: false, dumps the
// exact flagged_issues + the dislocation_description so we can see what leaked.
//
//   $env:ANTHROPIC_API_KEY = "sk-ant-..."; node src/test-factcheck-5x.js

import { analyzeImpact, factCheck } from "./utils/claudeAPI.js";
import { buildHoldingsSummary } from "./utils/matching.js";
import { mockNews } from "./data/mockNews.js";
import { mockClients } from "./data/mockClients.js";

const RUNS = 5;

async function main() {
  const news = mockNews.find((n) => n.id === "N006");
  if (!news) throw new Error("Tariff case N006 not found in mockNews");
  const holdingsSummary = buildHoldingsSummary(mockClients);

  // Detect the reference-case leak: Agent 1 must never cite the internal April
  // 2025 teaching case in its client-facing text fields. Check both scripts and
  // dates, Thai and English.
  const LEAK_PATTERNS = ["เมษายน 2025", "เมษายน 2568", "april 2025", "canonical"];
  const findLeak = (a1) => {
    const hay = `${a1.dislocation_description ?? ""}\n${a1.reasoning ?? ""}`.toLowerCase();
    return LEAK_PATTERNS.filter((p) => hay.includes(p.toLowerCase()));
  };

  const results = [];
  for (let i = 1; i <= RUNS; i++) {
    process.stdout.write(`Run ${i}/${RUNS} ... `);
    const a1 = await analyzeImpact(news, holdingsSummary);
    const a2 = await factCheck(news, a1);
    const leak = findLeak(a1);
    results.push({
      run: i,
      is_valid: a2.is_valid,
      dislocation_detected: a1.dislocation_detected,
      leak,
      a1,
      a2,
    });
    console.log(
      `is_valid: ${a2.is_valid ? "true ✅" : "false ❌"} | ` +
        `dislocation_detected: ${a1.dislocation_detected ? "true ✅" : "false ❌"} | ` +
        `leak: ${leak.length === 0 ? "none ✅" : leak.join(",") + " ❌"}`,
    );
  }

  console.log("\n=== SUMMARY ===");
  console.log("Run | is_valid | dislocation_detected | ref-case leak");
  for (const r of results) {
    console.log(
      `  ${r.run} |   ${String(r.is_valid).padEnd(6)}|        ${String(r.dislocation_detected).padEnd(14)}| ${r.leak.length === 0 ? "none" : r.leak.join(",")}`,
    );
  }

  // The three confirmations the fix must deliver.
  const allValid = results.every((r) => r.is_valid === true);
  const allDislocation = results.every((r) => r.dislocation_detected === true);
  const noLeak = results.every((r) => r.leak.length === 0);

  console.log("\n=== CONFIRMATIONS ===");
  console.log(`1. is_valid: true in all ${RUNS} runs          : ${allValid ? "PASS ✅" : "FAIL ❌"}`);
  console.log(`2. dislocation_detected: true in all ${RUNS} runs: ${allDislocation ? "PASS ✅" : "FAIL ❌"}`);
  console.log(`3. no reference-case leak in any run           : ${noLeak ? "PASS ✅" : "FAIL ❌"}`);

  // Show details for any run that failed ANY confirmation so we can trace it.
  const bad = results.filter(
    (r) => r.is_valid !== true || r.dislocation_detected !== true || r.leak.length > 0,
  );
  if (bad.length > 0) {
    console.log(`\n${bad.length} run(s) need inspection. Details:`);
    for (const r of bad) {
      console.log(`\n--- Run ${r.run} (is_valid=${r.is_valid}, dislocation=${r.dislocation_detected}, leak=[${r.leak.join(",")}]) ---`);
      console.log("flagged_issues:");
      console.log(JSON.stringify(r.a2.flagged_issues, null, 2));
      console.log("\ndislocation_description (Agent 1):");
      console.log(r.a1.dislocation_description);
      console.log("\nreasoning (Agent 1):");
      console.log(r.a1.reasoning);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\nALL CONFIRMATIONS PASSED across ${RUNS} runs ✅`);
}

main().catch((err) => {
  console.error("\n[test-factcheck-5x] FAILED:", err.message);
  process.exitCode = 1;
});
