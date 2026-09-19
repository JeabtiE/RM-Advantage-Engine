// Pure metric functions for the stability eval (evals/metrics.mjs).
// Synthetic run outputs with known distributions — no network, no credentials.
// The eval RUNNER (evals/stability.mjs) is never imported here: it makes real
// API calls and is run separately via `npm run eval:stability`.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  modal,
  sectorMetrics,
  tickerMetrics,
  clientMetrics,
  itemMetrics,
  toMarkdown,
} from "../evals/metrics.mjs";

const out = ({ scope = "systemic", sentiment = "negative", dislocation = true, sectors = [], tickers = [] }) => ({
  event_scope: scope,
  sentiment,
  dislocation_detected: dislocation,
  affected_tickers: tickers,
  // Mirrors normalization: neutral sectors are dropped from affected_sectors.
  affected_sectors: sectors.filter((s) => s.direction !== "neutral").map((s) => s.sector),
  sector_impacts: sectors,
});

test("modal: most frequent value, share, distribution; ties keep first-seen", () => {
  assert.deepEqual(modal(["a", "b", "a"]), {
    value: "a",
    count: 2,
    runs: 3,
    share: 2 / 3,
    distribution: { a: 2, b: 1 },
  });
  assert.equal(modal(["x", "y"]).value, "x", "tie -> first seen");
  assert.deepEqual(modal([]), { value: null, count: 0, runs: 0, share: 0, distribution: {} });
});

test("sectorMetrics: listed vs matching runs, direction counts, flip detection", () => {
  const outputs = [
    out({ sectors: [{ sector: "banking", direction: "positive" }, { sector: "technology", direction: "negative" }] }),
    out({ sectors: [{ sector: "banking", direction: "positive" }, { sector: "technology", direction: "positive" }] }),
    out({ sectors: [{ sector: "banking", direction: "positive" }, { sector: "healthcare", direction: "neutral" }] }),
    out({ sectors: [{ sector: "banking", direction: "positive" }] }),
  ];
  const m = sectorMetrics(outputs);
  assert.deepEqual(Object.keys(m), ["banking", "healthcare", "technology"], "sorted");

  assert.deepEqual(m.banking, {
    listedRuns: 4,
    listedShare: 1,
    matchingRuns: 4,
    matchingShare: 1,
    directionCounts: { positive: 4, negative: 0, neutral: 0 },
    modalDirection: "positive",
    modalDirectionShare: 1,
    flipped: false,
  });

  // technology appears in 2 of 4 runs and disagrees with itself.
  assert.equal(m.technology.listedRuns, 2);
  assert.equal(m.technology.listedShare, 0.5);
  assert.equal(m.technology.flipped, true);
  assert.equal(m.technology.modalDirectionShare, 0.5);
  assert.deepEqual(m.technology.directionCounts, { positive: 1, negative: 1, neutral: 0 });

  // neutral: listed once, but never used for matching.
  assert.equal(m.healthcare.listedRuns, 1);
  assert.equal(m.healthcare.matchingRuns, 0);
  assert.equal(m.healthcare.modalDirection, "neutral");
  assert.equal(m.healthcare.flipped, false);
});

test("sectorMetrics: a sector in affected_sectors with no sector_impacts entry is still reported", () => {
  const m = sectorMetrics([
    { affected_sectors: ["energy"], sector_impacts: [] },
    { affected_sectors: ["energy"], sector_impacts: [] },
  ]);
  assert.deepEqual(m.energy.directionCounts, { positive: 0, negative: 0, neutral: 0 });
  assert.equal(m.energy.listedRuns, 0);
  assert.equal(m.energy.matchingRuns, 2);
  assert.equal(m.energy.modalDirection, null);
});

test("tickerMetrics: mean/min/max, unanimous vs partial", () => {
  const t = tickerMetrics([
    out({ tickers: ["DELTA", "KCE"] }),
    out({ tickers: ["DELTA"] }),
    out({ tickers: ["DELTA", "KCE", "HANA"] }),
  ]);
  assert.equal(t.meanCount, 2);
  assert.equal(t.minCount, 1);
  assert.equal(t.maxCount, 3);
  assert.deepEqual(t.always, ["DELTA"]);
  assert.deepEqual(t.sometimes, [{ ticker: "HANA", runs: 1 }, { ticker: "KCE", runs: 2 }]);
});

test("clientMetrics: identical-set share, distinct sets, per-client counts", () => {
  const c = clientMetrics([
    ["C001", "C002"],
    ["C002", "C001"], // same set, different order
    ["C001"],
    ["C001", "C003"],
  ]);
  assert.equal(c.runs, 4);
  assert.equal(c.distinctSets, 3);
  assert.equal(c.identicalSetShare, 0.5);
  assert.equal(c.meanCount, 1.75);
  assert.deepEqual(c.perClient.C001, { runs: 4, share: 1 });
  assert.deepEqual(c.perClient.C002, { runs: 2, share: 0.5 });
  assert.deepEqual(c.perClient.C003, { runs: 1, share: 0.25 });
});

test("itemMetrics: perfectly stable item scores 1 and reports no flips", () => {
  const outputs = Array.from({ length: 5 }, () =>
    out({ sectors: [{ sector: "banking", direction: "positive" }], tickers: ["KBANK"] }),
  );
  const m = itemMetrics({ newsId: "T1", outputs, clientSets: Array(5).fill(["C001"]) });
  assert.equal(m.stabilityScore, 1);
  assert.deepEqual(m.flippedSectors, []);
  assert.equal(m.eventScope.share, 1);
  assert.equal(m.dislocation.detectedShare, 1);
});

test("itemMetrics: known mixed distribution -> expected shares and score", () => {
  // 3 runs: scope 2/3 systemic, sentiment 2/3 negative, dislocation 2/3 detected
  // (agreement 2/3), technology flips 2 positive / 1 negative (modal 2/3),
  // client sets: 2 identical of 3.
  const outputs = [
    out({ scope: "systemic", sentiment: "negative", dislocation: true, sectors: [{ sector: "technology", direction: "positive" }] }),
    out({ scope: "systemic", sentiment: "negative", dislocation: true, sectors: [{ sector: "technology", direction: "positive" }] }),
    out({ scope: "sector", sentiment: "neutral", dislocation: false, sectors: [{ sector: "technology", direction: "negative" }] }),
  ];
  const m = itemMetrics({ newsId: "T2", outputs, clientSets: [["C001"], ["C001"], ["C002"]] });
  const third = 2 / 3;
  assert.equal(m.eventScope.share, third);
  assert.equal(m.sentiment.share, third);
  assert.equal(m.dislocation.agreementShare, third);
  assert.equal(m.clients.identicalSetShare, third);
  assert.equal(m.sectors.technology.modalDirectionShare, third);
  assert.equal(m.stabilityScore, third, "mean of five equal shares");
  assert.deepEqual(m.flippedSectors, [
    { sector: "technology", directionCounts: { positive: 2, negative: 1, neutral: 0 } },
  ]);
});

test("toMarkdown: records provenance, the snapshot caveat and a table per item", () => {
  const outputs = [out({ sectors: [{ sector: "banking", direction: "positive" }], tickers: ["KBANK"] })];
  const item = { ...itemMetrics({ newsId: "N006", outputs, clientSets: [["C001"]] }), headline: "Tariff" };
  const md = toMarkdown({
    model: "claude-sonnet-4-6",
    temperature: 0,
    runs: 1,
    startedAt: "2026-09-19T00:00:00.000Z",
    items: [item, { newsId: "N999", headline: "broken", error: "boom", runs: 0 }],
    callsUsed: 1,
    notes: ["partial run"],
  });
  assert.match(md, /\*\*Model:\*\* `claude-sonnet-4-6`/);
  assert.match(md, /\*\*Temperature:\*\* 0/);
  assert.match(md, /\*\*Runs per item \(N\):\*\* 1/);
  assert.match(md, /2026-09-19/);
  assert.match(md, /snapshot of ONE session/);
  assert.match(md, /## N006 — Tariff/);
  assert.match(md, /\| banking \| 1\/1 \|/);
  assert.match(md, /\*\*Incomplete:\*\* boom/);
  assert.match(md, /⚠️ partial run/);
});

test("toMarkdown: a partially completed item shows the error AND the runs that finished", () => {
  const outputs = [
    out({ sectors: [{ sector: "property", direction: "positive" }] }),
    out({ sectors: [{ sector: "property", direction: "positive" }] }),
  ];
  const partial = {
    ...itemMetrics({ newsId: "EVAL-CPN", outputs, clientSets: [["C003"], ["C003"]] }),
    headline: "CPN",
    error: "run 3 failed — upstream_error",
    incomplete: true,
  };
  const md = toMarkdown({
    model: "m",
    temperature: 0,
    runs: 5,
    startedAt: "2026-09-19T00:00:00.000Z",
    items: [partial, { newsId: "N007", headline: "Fed", error: "run 1 failed", runs: 0 }],
    callsUsed: 3,
  });
  assert.match(md, /\*\*Incomplete:\*\* run 3 failed/);
  assert.match(md, /cover the 2 completed run\(s\) only/);
  assert.match(md, /\| property \| 2\/2 \|/, "partial metrics still tabulated");
  assert.match(md, /No run completed, so there is nothing to measure/);
});
