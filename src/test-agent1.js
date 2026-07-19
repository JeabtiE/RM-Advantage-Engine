// test-agent1.js — manual harness for Agent 1 (Impact + Dislocation Analyzer).
// Runs in the terminal (node), NOT the browser. Feeds the Trump Tariff / Gold
// case (N006 — the demo money shot) through analyzeImpact() and prints the
// full parsed result so we can eyeball the dislocation reasoning.
//
// Run it (PowerShell):
//   $env:ANTHROPIC_API_KEY = "sk-ant-..."; node src/test-agent1.js
//
// Run it (bash / macOS / Linux):
//   ANTHROPIC_API_KEY="sk-ant-..." node src/test-agent1.js
//
// Requires Node 18+ (global fetch). No build step, no Vite — plain node ESM.

import {
  analyzeImpact,
  factCheck,
  generateAllScripts,
} from "./utils/claudeAPI.js";
import {
  buildHoldingsSummary,
  calculateImpactShare,
  findAffectedClients,
  isKeyAccount,
} from "./utils/matching.js";
import { mockNews } from "./data/mockNews.js";
import { mockClients } from "./data/mockClients.js";

async function main() {
  const tariffNews = mockNews.find((n) => n.id === "N006");
  if (!tariffNews) throw new Error("Tariff case N006 not found in mockNews");

  const holdingsSummary = buildHoldingsSummary(mockClients);

  console.log("=== INPUT ===");
  console.log("Headline:", tariffNews.headline);
  console.log("\nMarket outcome:", tariffNews.marketOutcome);
  console.log("\nHoldings universe:\n" + holdingsSummary);

  console.log("\n=== CALLING AGENT 1 ... ===\n");
  const result = await analyzeImpact(tariffNews, holdingsSummary);

  console.log("=== AGENT 1 RESULT (full parsed JSON) ===");
  console.log(JSON.stringify(result, null, 2));

  // --- Phase 4: Agent 2 fact check (machine half of Four Eyes) ---------------
  // Re-read Agent 1's analysis against ONLY the original news + outcome and
  // flag anything unsupported before a human reviewer ever sees it.
  console.log("\n=== CALLING AGENT 2 (FACT CHECKER) ... ===\n");
  const factCheckResult = await factCheck(tariffNews, result);

  console.log("=== AGENT 2 RESULT (full parsed JSON) ===");
  console.log(JSON.stringify(factCheckResult, null, 2));

  // --- Phase 3: matching + priority scoring (deterministic JS, NO AI) --------
  // Take Agent 1's output above and answer the RM's real question: of the whole
  // book, who is exposed and who do I call first? findAffectedClients() matches
  // affected_tickers / affected_sectors against holdings; we sort by
  // priorityScore descending to get the call order.
  //
  // priorityScore is NOT the same as "% of portfolio affected" — it is
  // impact share + a flat Key Account boost for clients with AUM >= 10M (see the
  // client-prioritization skill). So the two are printed as SEPARATE columns
  // below: the % column is real exposure, the score column is what ranks. A Key
  // Account can sit above a client with a higher % — that is the boost working.
  const affected = findAffectedClients(result, mockClients);
  const ranked = [...affected].sort((a, b) => b.priorityScore - a.priorityScore);

  console.log("\n=== MATCHING + PRIORITY (N006) ===");
  console.log(
    `Clients matched: ${ranked.length} of ${mockClients.length}`,
  );
  console.log("\nRanked call list (by priorityScore = % affected + Key Account boost):");
  ranked.forEach((c, i) => {
    const pct = (calculateImpactShare(c.matchedHoldings) * 100).toFixed(0);
    const key = isKeyAccount(c) ? " KEY" : "    ";
    const tickers = c.matchedHoldings.map((h) => h.ticker).join(", ");
    console.log(
      `  ${String(i + 1).padStart(2)}. ${c.name.padEnd(28)} ${pct.padStart(3)}%${key}` +
        `  score=${c.priorityScore.toFixed(2)}  [${tickers}]`,
    );
  });

  // --- Phase 5: Agent 3 script generation (top 3 highest-priority clients) ---
  // Feed the fact-checked reasoning (adjusted_reasoning from Agent 2, falling
  // back to Agent 1's) as the APPROVED insight — this stands in for what the
  // CIO signs off in the Four Eyes gate — and generate a per-client phone
  // script for the three clients the priority ranking says to call first.
  const approvedInsight = {
    sentiment: result.sentiment,
    dislocation_description: result.dislocation_description,
    reasoning: factCheckResult.adjusted_reasoning || result.reasoning,
  };
  const top3 = ranked.slice(0, 3);

  // For a genuine conservative-vs-aggressive-vs-moderate demo side-by-side, also
  // pull the highest-priority CONSERVATIVE client from the FULL ranked list (the
  // top 3 by priority happen to be aggressive/moderate). If that client is
  // already in the top 3 we don't duplicate them; otherwise we append so all
  // three risk tones appear together. Top-3 priority logic above is untouched.
  const topConservative = ranked.find((c) => c.riskProfile === "conservative");
  const toScript =
    topConservative && !top3.some((c) => c.clientId === topConservative.clientId)
      ? [...top3, topConservative]
      : top3;

  console.log("\n=== CALLING AGENT 3 (SCRIPT GENERATOR) ... ===\n");
  const scripts = await generateAllScripts(approvedInsight, toScript);

  // Directive language is the license-law red line (CLAUDE.md constraint #2 +
  // the rm-script-writing skill). If ANY script contains one of these, the
  // whole test fails — this is the check the whole approval pipeline exists for.
  const BANNED = ["ควรซื้อ", "ควรขาย", "ควรถือ", "ควรเพิ่ม", "ควรลด", "แนะนำให้"];

  console.log("=== SCRIPTS (conservative vs moderate vs aggressive tone) ===");
  scripts.forEach((s, i) => {
    console.log(`\n  ${i + 1}. ${s.name}  [${s.riskProfile}]`);
    if (!s.ok) {
      console.log(`     ⚠️  generation FAILED: ${s.error}`);
      return;
    }
    console.log(`     ${s.script}`);
    const hits = BANNED.filter((b) => s.script.includes(b));
    console.log(
      hits.length === 0
        ? "     ✅ no directive language"
        : `     ❌ DIRECTIVE LANGUAGE: ${hits.join(", ")}`,
    );
  });

  const allScriptsOk = scripts.every((s) => s.ok);
  const noDirective = scripts.every(
    (s) => !s.ok || !BANNED.some((b) => s.script.includes(b)),
  );

  // Assertions specific to the Tariff/Gold dislocation case (N006).
  // Each check prints PASS/FAIL; any failure flips the process exit code so
  // `node src/test-agent1.js` can be used in CI or a pre-demo sanity script.
  const checks = [
    [
      "dislocation_detected === true",
      result.dislocation_detected === true,
    ],
    [
      "dislocation_description mentions gold (ทองคำ)",
      typeof result.dislocation_description === "string" &&
        result.dislocation_description.includes("ทองคำ"),
    ],
    [
      "affected_sectors non-empty",
      Array.isArray(result.affected_sectors) &&
        result.affected_sectors.length > 0,
    ],
    [
      "affected_tickers non-empty",
      Array.isArray(result.affected_tickers) &&
        result.affected_tickers.length > 0,
    ],
    ['sentiment === "negative"', result.sentiment === "negative"],
    [`all ${scripts.length} scripts generated (Agent 3)`, allScriptsOk],
    ["no script uses directive language (ควรซื้อ/ควรขาย/…)", noDirective],
  ];

  console.log("\n=== CHECKS ===");
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`${ok ? "PASS ✅" : "FAIL ❌"}  ${label}`);
    if (!ok) failed++;
  }

  console.log(
    `\n=== ${failed === 0 ? "ALL CHECKS PASSED ✅" : `${failed} CHECK(S) FAILED ❌`} ===`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("\n[test-agent1] FAILED:", err.message);
  process.exitCode = 1;
});
