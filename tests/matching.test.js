// matching.js v2 tests — scope gate, per-holding direction, backward
// compatibility with pre-Phase-3 Agent 1 output, and the Fed/FOMC keywords.
// Pure deterministic JS: no network, no API key.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findAffectedClients,
  calculatePriority,
  filterRelevantNews,
  KEY_ACCOUNT_BOOST,
} from "../src/utils/matching.js";
import { mockClients } from "../src/data/mockClients.js";
import { cachedDemoRuns } from "../src/data/cachedDemoRun.js";

// Frozen copy of the pre-v2 findAffectedClients — the reference the new
// implementation must reproduce when event_scope / sector_impacts are absent.
// Do NOT update this to track matching.js; its whole point is to stay old.
function findAffectedClientsV1(agent1Output, clients = mockClients) {
  const tickers = new Set(
    (agent1Output?.affected_tickers ?? []).map((t) => String(t).toUpperCase()),
  );
  const sectors = new Set(
    (agent1Output?.affected_sectors ?? []).map((s) => String(s).toLowerCase()),
  );

  const affected = [];
  for (const client of clients) {
    const matchedHoldings = client.holdings.filter(
      (h) =>
        tickers.has(String(h.ticker).toUpperCase()) ||
        sectors.has(String(h.sector).toLowerCase()),
    );
    if (matchedHoldings.length === 0) continue;

    affected.push({
      ...client,
      matchedHoldings,
      priorityScore: calculatePriority(client, matchedHoldings),
    });
  }
  return affected;
}

// Comparable projection: client order, matched tickers (in holding order), score.
const summarize = (clients) =>
  clients.map((c) => ({
    clientId: c.clientId,
    tickers: c.matchedHoldings.map((h) => h.ticker),
    priorityScore: c.priorityScore,
  }));

const byId = (clients) => Object.fromEntries(clients.map((c) => [c.clientId, c]));

// --- Backward compatibility ----------------------------------------------------

test("regression: every cached Agent 1 output matches the v1 implementation", () => {
  const outputs = Object.values(cachedDemoRuns).map((r) => r.analysis);
  assert.ok(outputs.length >= 2, "expected the N006 and N003 cached analyses");
  for (const analysis of outputs) {
    assert.equal(analysis.event_scope, undefined, "cache predates event_scope");
    assert.equal(analysis.sector_impacts, undefined, "cache predates sector_impacts");
    assert.deepEqual(
      summarize(findAffectedClients(analysis)),
      summarize(findAffectedClientsV1(analysis)),
    );
  }
});

test("regression: cached ranked lists are reproduced exactly", () => {
  // Same sort useDraft applies. Guards the on-screen order of the demo, not
  // just set equality.
  const sort = (xs) => [...xs].sort((a, b) => b.priorityScore - a.priorityScore);
  for (const [id, run] of Object.entries(cachedDemoRuns)) {
    assert.deepEqual(
      summarize(sort(findAffectedClients(run.analysis))),
      summarize(run.affectedClients),
      `ranked list drifted for ${id}`,
    );
  }
});

test("regression: extra v1-shaped outputs (mixed case, empty, ticker-only) match v1", () => {
  const outputs = [
    { affected_tickers: [], affected_sectors: [], sentiment: "neutral" },
    { affected_tickers: ["kbank", "Delta"], affected_sectors: ["PROPERTY"], sentiment: "negative" },
    { affected_tickers: ["PTT"], affected_sectors: [], sentiment: "positive" },
    { affected_sectors: ["banking", "telecom", "transport"] },
    {},
    null,
  ];
  for (const o of outputs) {
    assert.deepEqual(summarize(findAffectedClients(o)), summarize(findAffectedClientsV1(o)));
  }
});

test("v1-shaped output: holdings gain matchedBy + sentiment direction", () => {
  const [client] = findAffectedClients(
    { affected_tickers: ["KBANK"], affected_sectors: ["property"], sentiment: "negative" },
    [
      {
        clientId: "T1",
        aum: 1,
        holdings: [
          { ticker: "KBANK", sector: "banking", weight: 0.5 },
          { ticker: "LH", sector: "property", weight: 0.3 },
          { ticker: "PTT", sector: "energy", weight: 0.2 },
        ],
      },
    ],
  );
  assert.deepEqual(
    client.matchedHoldings.map(({ ticker, matchedBy, direction }) => ({ ticker, matchedBy, direction })),
    [
      { ticker: "KBANK", matchedBy: "ticker", direction: "negative" },
      { ticker: "LH", matchedBy: "sector", direction: "negative" },
    ],
  );
});

// --- Fixtures ------------------------------------------------------------------

const client = (clientId, holdings, aum = 1_000_000) => ({
  clientId,
  name: clientId,
  riskProfile: "moderate",
  aum,
  holdings,
});

const holdsCPN = client("HOLDS_CPN", [
  { ticker: "CPN", name: "Central Pattana", sector: "property", weight: 0.4 },
  { ticker: "KBANK", name: "Kasikornbank", sector: "banking", weight: 0.6 },
]);
const holdsOtherProperty = client("OTHER_PROPERTY", [
  { ticker: "SPALI", name: "Supalai", sector: "property", weight: 0.5 },
  { ticker: "AMATA", name: "Amata", sector: "property", weight: 0.5 },
]);

// --- single_company scope ------------------------------------------------------------

test("single_company: same-sector different ticker is NOT matched; named ticker is", () => {
  const out = findAffectedClients(
    {
      affected_tickers: ["CPN"],
      affected_sectors: ["property"],
      sentiment: "positive",
      event_scope: "single_company",
    },
    [holdsCPN, holdsOtherProperty],
  );
  assert.deepEqual(out.map((c) => c.clientId), ["HOLDS_CPN"]);
  assert.deepEqual(
    out[0].matchedHoldings.map(({ ticker, matchedBy }) => ({ ticker, matchedBy })),
    [{ ticker: "CPN", matchedBy: "ticker" }],
  );
  // Only the CPN weight counts toward priority — not the whole property sleeve.
  assert.equal(out[0].priorityScore, 0.4);
});

test("systemic and sector scopes still match by sector (and missing/unknown scope = systemic)", () => {
  for (const event_scope of ["systemic", "sector", undefined, "global", 42]) {
    const out = findAffectedClients(
      { affected_tickers: ["CPN"], affected_sectors: ["property"], sentiment: "positive", event_scope },
      [holdsCPN, holdsOtherProperty],
    );
    assert.deepEqual(out.map((c) => c.clientId), ["HOLDS_CPN", "OTHER_PROPERTY"], String(event_scope));
    assert.deepEqual(
      out[1].matchedHoldings.map((h) => h.matchedBy),
      ["sector", "sector"],
    );
  }
});

test("ticker wins over sector when a holding matches both", () => {
  const [c] = findAffectedClients(
    { affected_tickers: ["cpn"], affected_sectors: ["Property"], sentiment: "positive" },
    [holdsCPN],
  );
  assert.equal(c.matchedHoldings[0].matchedBy, "ticker");
});

// --- Direction ---------------------------------------------------------------------

const rateHike = {
  affected_tickers: [],
  affected_sectors: ["banking", "property"],
  sentiment: "negative",
  event_scope: "systemic",
  sector_impacts: [
    { sector: "banking", direction: "positive" },
    { sector: "property", direction: "negative" },
  ],
};

const bankAndProperty = client("MIXED", [
  { ticker: "KBANK", name: "Kasikornbank", sector: "banking", weight: 0.3 },
  { ticker: "LH", name: "Land & Houses", sector: "property", weight: 0.3 },
  { ticker: "PTT", name: "PTT", sector: "energy", weight: 0.4 },
]);

test("sector_impacts: rate hike tags banks positive and property negative", () => {
  const [c] = findAffectedClients(rateHike, [bankAndProperty]);
  const dir = Object.fromEntries(c.matchedHoldings.map((h) => [h.ticker, h.direction]));
  assert.deepEqual(dir, { KBANK: "positive", LH: "negative" });
});

test("fallback: sector only in affected_sectors inherits top-level sentiment", () => {
  const [c] = findAffectedClients(
    {
      ...rateHike,
      affected_sectors: ["banking", "property", "energy"],
      sector_impacts: [{ sector: "banking", direction: "positive" }],
    },
    [bankAndProperty],
  );
  const dir = Object.fromEntries(c.matchedHoldings.map((h) => [h.ticker, h.direction]));
  assert.deepEqual(dir, { KBANK: "positive", LH: "negative", PTT: "negative" });
});

test("fallback: no sector_impacts and no/invalid sentiment → neutral", () => {
  for (const sentiment of [undefined, "bullish", null]) {
    const [c] = findAffectedClients(
      { affected_tickers: [], affected_sectors: ["banking"], sentiment },
      [bankAndProperty],
    );
    assert.equal(c.matchedHoldings[0].direction, "neutral");
  }
});

test("ticker-only match uses its sector direction if known, else sentiment", () => {
  const holdings = [
    client("C", [
      { ticker: "KBANK", name: "K", sector: "banking", weight: 0.5 },
      { ticker: "PTT", name: "P", sector: "energy", weight: 0.5 },
    ]),
  ];
  const [c] = findAffectedClients(
    {
      affected_tickers: ["KBANK", "PTT"],
      affected_sectors: [],
      sentiment: "negative",
      event_scope: "single_company",
      sector_impacts: [{ sector: "banking", direction: "positive" }],
    },
    holdings,
  );
  const dir = Object.fromEntries(c.matchedHoldings.map((h) => [h.ticker, h.direction]));
  assert.deepEqual(dir, { KBANK: "positive", PTT: "negative" });
});

test("sector_impacts never widens the match set", () => {
  const out = findAffectedClients(
    {
      affected_tickers: [],
      affected_sectors: ["banking"],
      sentiment: "neutral",
      sector_impacts: [{ sector: "property", direction: "negative" }],
    },
    [holdsOtherProperty],
  );
  assert.deepEqual(out, []);
});

test("malformed sector_impacts entries are ignored, unknown direction → neutral", () => {
  const malformed = [
    null,
    "banking",
    42,
    [],
    {},
    { direction: "positive" },
    { sector: "", direction: "positive" },
    { sector: 7, direction: "positive" },
    { sector: "property", direction: "sideways" },
    { sector: "property", direction: "positive" }, // duplicate — first entry wins
    { sector: " BANKING ", direction: "POSITIVE" },
  ];
  let out;
  assert.doesNotThrow(() => {
    out = findAffectedClients({ ...rateHike, sector_impacts: malformed }, [bankAndProperty]);
  });
  const dir = Object.fromEntries(out[0].matchedHoldings.map((h) => [h.ticker, h.direction]));
  assert.deepEqual(dir, { KBANK: "positive", LH: "neutral" });

  for (const sector_impacts of ["nope", 5, { sector: "banking" }, null]) {
    assert.doesNotThrow(() => findAffectedClients({ ...rateHike, sector_impacts }, [bankAndProperty]));
  }
});

// --- Gross exposure ----------------------------------------------------------------

test("offsetting +/- exposure keeps gross priorityScore (no netting)", () => {
  const [c] = findAffectedClients(rateHike, [bankAndProperty]);
  const dirs = c.matchedHoldings.map((h) => h.direction).sort();
  assert.deepEqual(dirs, ["negative", "positive"]);
  assert.equal(c.priorityScore, 0.6); // 0.3 + 0.3, not 0.3 − 0.3

  const keyAccount = { ...bankAndProperty, clientId: "MIXED_KEY", aum: 50_000_000 };
  const [k] = findAffectedClients(rateHike, [keyAccount]);
  assert.equal(k.priorityScore, 0.6 + KEY_ACCOUNT_BOOST);
});

// --- filterRelevantNews: Fed / FOMC ----------------------------------------------

test("filter passes English FOMC news with no 'interest rate' or 'inflation'", () => {
  const news = {
    headline: "FOMC holds the federal funds rate steady, signals two cuts",
    content:
      "The Committee decided to maintain the target range for the federal funds " +
      "rate at 4-1/4 to 4-1/2 percent. Fed officials see two reductions this year.",
  };
  const text = `${news.headline} ${news.content}`.toLowerCase();
  assert.ok(!text.includes("interest rate") && !text.includes("inflation"));

  const v = filterRelevantNews(news);
  assert.equal(v.relevant, true);
  assert.ok(v.matchedMacroFactors.includes("rates"));
});

test("filter passes a Thai 'เฟด' headline", () => {
  const v = filterRelevantNews({ headline: "เฟดส่งสัญญาณชะลอการปรับนโยบาย", content: "" });
  assert.equal(v.relevant, true);
  assert.deepEqual(v.matchedMacroFactors, ["rates"]);
});

test("filter: new English terms are word-bounded", () => {
  // "federation" / "confederate" must not trip "fed" — \b still applies.
  const v = filterRelevantNews({
    headline: "Football federation confederate cup draw",
    content: "",
  });
  assert.equal(v.relevant, false);
});
