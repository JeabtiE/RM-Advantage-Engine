// test-filter.js — manual harness for filterRelevantNews() (the pre-Agent-1
// relevance guard). Pure deterministic JS: NO API KEY, no network, no cost.
//
// Run it:
//   node src/test-filter.js
//
// Asserts three things:
//   1. Every real news item (N001-N004, N006) PASSES — none of them may ever be
//      screened out, or the demo loses a scenario.
//   2. A deliberately irrelevant headline is SKIPPED — the filter's whole job.
//   3. N006 (Tariff/Gold money shot) passes on MACRO factors specifically. It
//      names no ticker and no held sector, so a filter keyed only on
//      tickers+sectors would skip it. This assertion is the regression guard on
//      that exact failure — if it fires, the money shot is about to silently
//      lose its Agent 1 call.

import { filterRelevantNews } from "./utils/matching.js";
import { mockNews } from "./data/mockNews.js";

// News with zero bearing on any client portfolio — a sports result.
const IRRELEVANT_NEWS = {
  id: "X001",
  headline: "นักวิ่งมาราธอนคว้าแชมป์โลก",
  content:
    "นักกีฬาชาวเคนยาคว้าแชมป์มาราธอนโลกด้วยสถิติใหม่ 2 ชั่วโมง 1 นาที " +
    "ท่ามกลางผู้ชมกว่าห้าหมื่นคนที่มาร่วมเชียร์ตลอดเส้นทาง",
  source: "BBC Sport",
  publishedAt: "2026-07-12T09:00:00Z",
  marketOutcome: "ไม่มีผลต่อตลาด",
};

let failures = 0;

function check(label, condition, detail = "") {
  const ok = !!condition;
  if (!ok) failures++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("=== 1. Real news must ALL pass the filter ===\n");
for (const news of mockNews) {
  const v = filterRelevantNews(news);
  console.log(`${news.id}  ${news.headline}`);
  check(`${news.id} relevant`, v.relevant, v.reason);
  console.log("");
}

console.log("=== 2. Irrelevant news must be SKIPPED (no Agent 1 call) ===\n");
const irrelevantVerdict = filterRelevantNews(IRRELEVANT_NEWS);
console.log(`X001  ${IRRELEVANT_NEWS.headline}`);
check("X001 screened out", !irrelevantVerdict.relevant, irrelevantVerdict.reason);
check(
  "X001 has no matches at all",
  irrelevantVerdict.matchedTickers.length === 0 &&
    irrelevantVerdict.matchedSectors.length === 0 &&
    irrelevantVerdict.matchedMacroFactors.length === 0,
);

console.log("\n=== 3. N006 regression guard (money shot survives on macro) ===\n");
const n6 = filterRelevantNews(mockNews.find((n) => n.id === "N006"));
console.log("  matched tickers :", n6.matchedTickers);
console.log("  matched sectors :", n6.matchedSectors);
console.log("  matched macro   :", n6.matchedMacroFactors);
check("N006 relevant", n6.relevant);
check(
  "N006 passes via macro factors (tickers/sectors alone would NOT save it)",
  n6.matchedMacroFactors.length > 0,
);

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
);
process.exit(failures === 0 ? 0 : 1);
