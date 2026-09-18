// CIO review application (src/utils/cioReview.js) and the committed N007 draft.
// Pure deterministic JS: no network, no API key.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  applyCioReview,
  parsePath,
  reviewBlockers,
  validateReviewShape,
  TEAM_DECISION_MARKER,
} from "../src/utils/cioReview.js";
import { cachedDemoRuns } from "../src/data/cachedDemoRun.js";

const analysis = {
  affected_tickers: ["DELTA"],
  affected_sectors: ["banking", "technology"],
  sentiment: "negative",
  event_scope: "systemic",
  sector_impacts: [
    { sector: "banking", direction: "positive", reason: "NIM กว้างขึ้น" },
    { sector: "technology", direction: "negative", reason: "discount rate สูงขึ้น" },
  ],
  dislocation_detected: true,
  dislocation_description: "ต้นฉบับ",
  reasoning: "เหตุผลเดิม",
  normalization_notes: [],
};

const review = (changes, reviewer = "CIO Somchai") => ({
  reviewer,
  reviewedAt: "2026-09-18T03:00:00.000Z",
  changes,
});
const change = (path, before, after, rationale = "เหตุผล") => ({ path, before, after, rationale });

test("allowed paths parse; everything else is rejected", () => {
  for (const p of [
    "reasoning",
    "sentiment",
    "dislocation_description",
    "sector_impacts[technology].direction",
    "sector_impacts[banking].reason",
  ]) {
    assert.ok(parsePath(p), p);
  }
  for (const p of [
    "affected_tickers",
    "affected_sectors",
    "event_scope",
    "dislocation_detected",
    "normalization_notes",
    "sector_impacts[technology].sector",
    "sector_impacts[0].direction",
    "sector_impacts[Technology].direction",
    "sector_impacts.technology.direction",
    "__proto__",
    "reasoning ",
    "",
    null,
  ]) {
    assert.equal(parsePath(p), null, String(p));
    const { analysis: out, errors } = applyCioReview(analysis, review([change(p, "x", "y")]));
    assert.equal(out, null);
    assert.ok(errors.some((e) => e.includes("not allowed")), String(p));
  }
});

test("valid review is applied; the original analysis is never mutated", () => {
  const snapshot = structuredClone(analysis);
  const { analysis: out, errors } = applyCioReview(
    analysis,
    review([
      change("dislocation_description", "ต้นฉบับ", "ฉบับแก้"),
      change("sector_impacts[technology].direction", "negative", "positive"),
      change("sector_impacts[technology].reason", "discount rate สูงขึ้น", "บาทอ่อนหนุนผู้ส่งออก"),
      change("sentiment", "negative", "neutral"),
    ]),
  );
  assert.deepEqual(errors, []);
  assert.equal(out.dislocation_description, "ฉบับแก้");
  assert.equal(out.sentiment, "neutral");
  assert.deepEqual(out.sector_impacts[1], {
    sector: "technology",
    direction: "positive",
    reason: "บาทอ่อนหนุนผู้ส่งออก",
  });
  assert.deepEqual(analysis, snapshot, "original untouched");
  assert.equal(out.reasoning, analysis.reasoning, "unchanged fields carried over");
});

test("stale before is rejected and nothing is applied (all-or-nothing)", () => {
  const { analysis: out, errors } = applyCioReview(
    analysis,
    review([
      change("reasoning", "เหตุผลเดิม", "ใหม่"),
      change("dislocation_description", "ข้อความที่ไม่ตรงกับแคช", "ใหม่"),
    ]),
  );
  assert.equal(out, null);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /stale/);
});

test("enum paths require a valid direction; unknown sector and empty text are rejected", () => {
  const cases = [
    [change("sentiment", "negative", "bullish"), /after must be/],
    [change("sector_impacts[technology].direction", "negative", "up"), /after must be/],
    [change("sector_impacts[energy].direction", "negative", "positive"), /no sector_impacts entry/],
    [change("reasoning", "เหตุผลเดิม", "   "), /must not be empty/],
  ];
  for (const [c, re] of cases) {
    const { analysis: out, errors } = applyCioReview(analysis, review([c]));
    assert.equal(out, null, c.path);
    assert.ok(errors.some((e) => re.test(e)), `${c.path}: ${errors}`);
  }
});

test("shape errors: missing reviewer/date/changes, duplicate path, missing rationale", () => {
  assert.ok(validateReviewShape(null).length);
  assert.ok(validateReviewShape({ reviewer: "x", reviewedAt: "nope", changes: [] }).length >= 2);
  const dup = review([change("reasoning", "a", "b"), change("reasoning", "a", "c")]);
  assert.ok(validateReviewShape(dup).some((e) => e.includes("more than once")));
  const noWhy = review([{ path: "reasoning", before: "a", after: "b", rationale: " " }]);
  assert.ok(validateReviewShape(noWhy).some((e) => e.includes("rationale")));
});

test("a DRAFT reviewer or an open team decision blocks applying", () => {
  const draft = review([change("reasoning", "เหตุผลเดิม", "ใหม่")], "DRAFT — pending team review");
  assert.ok(reviewBlockers(draft).some((b) => b.includes("draft")));
  assert.equal(applyCioReview(analysis, draft).analysis, null);

  const open = review([change("sector_impacts[technology].direction", "negative", TEAM_DECISION_MARKER)]);
  assert.ok(reviewBlockers(open).some((b) => b.includes(TEAM_DECISION_MARKER)));
  assert.equal(applyCioReview(analysis, open).analysis, null);

  assert.deepEqual(reviewBlockers(review([change("reasoning", "a", "b")])), []);
});

// --- The committed N007 draft ---------------------------------------------------

const n007Draft = JSON.parse(
  readFileSync(new URL("../src/data/cioReviews/N007.json", import.meta.url), "utf8"),
);

test("N007 draft: well-formed, every before matches the cache exactly, and it is blocked", () => {
  assert.deepEqual(validateReviewShape(n007Draft), []);
  const cached = cachedDemoRuns.N007.analysis;
  for (const c of n007Draft.changes) {
    const p = parsePath(c.path);
    const current =
      p.kind === "top" ? cached[p.key] : cached.sector_impacts.find((s) => s.sector === p.sector)[p.field];
    assert.equal(current, c.before, `${c.path} before is not stale`);
  }
  const blockers = reviewBlockers(n007Draft);
  assert.equal(blockers.length, 2, blockers.join("; "));
  assert.equal(applyCioReview(cached, n007Draft).analysis, null);
});

test("N007 draft dislocation edit removes the peak inference and the action, keeps the facts", () => {
  const { before, after } = n007Draft.changes.find((c) => c.path === "dislocation_description");
  assert.match(before, /จุดสูงสุด/);
  assert.match(before, /สะสม/);
  assert.doesNotMatch(after, /จุดสูงสุด|สะสม|oversold/);
  for (const fact of ["+1.32%", "BBL", "KTB", "DELTA", "dot plot", "ปานกลาง"]) {
    assert.ok(after.includes(fact), fact);
  }
  const tech = n007Draft.changes.find((c) => c.path === "sector_impacts[technology].direction");
  assert.equal(tech.after, TEAM_DECISION_MARKER);
  assert.match(tech.rationale, /discount rate/);
  assert.match(tech.rationale, /\+3\.00%/);
});
