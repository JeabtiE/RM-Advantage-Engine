// Tests for the demo-cache regen ranking diff (scripts/rankingDiff.mjs).
// Pure functions only — the regen script itself is never run here.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";

import { rankingDiff, formatRankingDiff } from "../scripts/rankingDiff.mjs";
import { cachedDemoRuns } from "../src/data/cachedDemoRun.js";

const c = (clientId, priorityScore) => ({ clientId, priorityScore });

test("identical rankings -> every row 'same', verdict unchanged", () => {
  const list = cachedDemoRuns.N006.affectedClients;
  const rows = rankingDiff(list, structuredClone(list));
  assert.equal(rows.length, list.length);
  assert.ok(rows.every((r) => r.change === "same"));
  assert.match(formatRankingDiff("N006", rows), /ranking unchanged/);
});

test("moved / added / removed are reported, in after-order then removed", () => {
  const before = [c("C1", 1), c("C2", 0.9), c("C3", 0.8)];
  const after = [c("C2", 0.9), c("C1", 0.75), c("C4", 0.5)];
  const rows = rankingDiff(before, after);
  assert.deepEqual(
    rows.map((r) => [r.clientId, r.change]),
    [["C2", "moved"], ["C1", "moved"], ["C4", "added"], ["C3", "removed"]],
  );
  assert.deepEqual(rows[1].before, { rank: 1, score: 1 });
  assert.deepEqual(rows[1].after, { rank: 2, score: 0.75 });
  assert.equal(rows[3].after, null);
  const text = formatRankingDiff("X", rows);
  assert.match(text, /4 client\(s\) changed — REVIEW/);
  assert.match(text, /\+ C4 /);
  assert.match(text, /- C3 /);
});

test("same rank but a different score counts as moved; float noise does not", () => {
  const rows = rankingDiff([c("A", 1), c("B", 0.3)], [c("A", 0.9), c("B", 0.1 + 0.2)]);
  assert.deepEqual(rows.map((r) => r.change), ["moved", "same"]);
});

test("no previous cache entry -> every client 'added'", () => {
  const rows = rankingDiff(undefined, [c("A", 1)]);
  assert.deepEqual(rows.map((r) => r.change), ["added"]);
});

test("the observed N006 healthcare flip is surfaced as a reviewable diff", () => {
  // Phase 3.2 live run: healthcare tagged neutral -> BDMS/BH/BCH weight dropped.
  const before = cachedDemoRuns.N006.affectedClients;
  const liveScores = { C002: 1, C003: 1, C005: 1, C007: 0.9, C006: 0.85, C009: 0.8, C001: 0.75, C008: 0.75, C010: 0.75, C004: 0.25 };
  const after = Object.entries(liveScores).map(([id, s]) => c(id, s));
  const rows = rankingDiff(before, after);
  const changed = rows.filter((r) => r.change !== "same").map((r) => r.clientId);
  assert.deepEqual(changed.sort(), ["C001", "C004", "C006", "C007", "C008", "C009", "C010"]);
});
