// Agent 1 post-parse normalization (api/claude-agent.js) and its hand-off to
// matching.js. Pure deterministic JS: no network, no API key.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeAgent1Output,
  heldSectorsFromSummary,
} from "../api/claude-agent.js";
import { buildHoldingsSummary, findAffectedClients } from "../src/utils/matching.js";
import { getAllSectors } from "../src/data/mockClients.js";

const HELD = heldSectorsFromSummary(buildHoldingsSummary());

const base = (extra = {}) => ({
  affected_tickers: [],
  affected_sectors: [],
  sentiment: "negative",
  dislocation_detected: false,
  dislocation_description: "",
  reasoning: "r",
  ...extra,
});

// --- Held sectors ---------------------------------------------------------------

test("heldSectorsFromSummary reads every held sector, incl. names with parentheses", () => {
  assert.deepEqual([...HELD].sort(), [...getAllSectors()].sort());
  const s = heldSectorsFromSummary("AP (เอพี (ไทยแลนด์), property)\nX (a, b, Banking )\ngarbage");
  assert.deepEqual([...s].sort(), ["banking", "property"]);
});

// --- Normalization rules ----------------------------------------------------------

test("clean output passes through with no notes", () => {
  const input = base({
    affected_sectors: ["banking", "property"],
    event_scope: "systemic",
    sector_impacts: [
      { sector: "banking", direction: "positive" },
      { sector: "property", direction: "negative" },
    ],
  });
  const out = normalizeAgent1Output(input, HELD);
  assert.deepEqual(out, { ...input, normalization_notes: [] });
});

test("v1-shaped output (no new fields) is unchanged apart from an empty notes list", () => {
  const input = base({ affected_tickers: ["KBANK"], affected_sectors: ["banking"] });
  assert.deepEqual(normalizeAgent1Output(input, HELD), { ...input, normalization_notes: [] });
});

test("sector strings are lowercased/trimmed everywhere; duplicates collapse", () => {
  const out = normalizeAgent1Output(
    base({
      affected_sectors: [" Banking", "banking", "PROPERTY"],
      sector_impacts: [{ sector: " BANKING ", direction: "Positive" }],
    }),
    HELD,
  );
  assert.deepEqual(out.affected_sectors, ["banking", "property"]);
  assert.deepEqual(out.sector_impacts, [{ sector: "banking", direction: "positive" }]);
  assert.ok(out.normalization_notes.length >= 2);
});

test("union: a sector only in sector_impacts is added to affected_sectors", () => {
  const out = normalizeAgent1Output(
    base({
      affected_sectors: ["banking"],
      sector_impacts: [
        { sector: "banking", direction: "positive" },
        { sector: "property", direction: "negative" },
      ],
    }),
    HELD,
  );
  assert.deepEqual(out.affected_sectors, ["banking", "property"]);
  assert.equal(out.normalization_notes.length, 1);
  assert.match(out.normalization_notes[0], /property/);
});

test("union also works when affected_sectors is missing entirely", () => {
  const input = base({ sector_impacts: [{ sector: "energy", direction: "positive" }] });
  delete input.affected_sectors;
  assert.deepEqual(normalizeAgent1Output(input, HELD).affected_sectors, ["energy"]);
});

test("never removes sectors from affected_sectors, even unheld ones", () => {
  const out = normalizeAgent1Output(
    base({ affected_sectors: ["banking", "retail", "utilities"] }),
    HELD,
  );
  assert.deepEqual(out.affected_sectors, ["banking", "retail", "utilities"]);
});

test("sectors in affected_sectors get no invented sector_impacts entry", () => {
  const out = normalizeAgent1Output(
    base({
      affected_sectors: ["banking", "energy"],
      sector_impacts: [{ sector: "banking", direction: "positive" }],
    }),
    HELD,
  );
  assert.deepEqual(out.sector_impacts, [{ sector: "banking", direction: "positive" }]);
});

test("unknown (unheld) sector in sector_impacts is dropped with a note", () => {
  const out = normalizeAgent1Output(
    base({
      affected_sectors: ["banking"],
      sector_impacts: [
        { sector: "retail", direction: "positive" },
        { sector: "banking", direction: "positive" },
      ],
    }),
    HELD,
  );
  assert.deepEqual(out.sector_impacts, [{ sector: "banking", direction: "positive" }]);
  assert.ok(!out.affected_sectors.includes("retail"), "dropped impact must not be unioned");
  assert.ok(out.normalization_notes.some((n) => n.includes("retail")));
});

test("unknown direction becomes neutral with a note", () => {
  const out = normalizeAgent1Output(
    base({
      affected_sectors: ["banking", "energy"],
      sector_impacts: [
        { sector: "banking", direction: "bullish" },
        { sector: "energy" },
      ],
    }),
    HELD,
  );
  assert.deepEqual(out.sector_impacts, [
    { sector: "banking", direction: "neutral" },
    { sector: "energy", direction: "neutral" },
  ]);
  assert.equal(out.normalization_notes.length, 2);
});

test("duplicate sectors keep the first entry", () => {
  const out = normalizeAgent1Output(
    base({
      affected_sectors: ["property"],
      sector_impacts: [
        { sector: "property", direction: "negative" },
        { sector: "Property", direction: "positive" },
      ],
    }),
    HELD,
  );
  assert.deepEqual(out.sector_impacts, [{ sector: "property", direction: "negative" }]);
  assert.ok(out.normalization_notes.some((n) => n.includes("ซ้ำ")));
});

test("malformed sector_impacts entries / non-array are dropped with notes", () => {
  const out = normalizeAgent1Output(
    base({ sector_impacts: [null, "banking", {}, { sector: 3 }, { sector: "  " }] }),
    HELD,
  );
  assert.deepEqual(out.sector_impacts, []);
  assert.equal(out.normalization_notes.length, 5);

  const out2 = normalizeAgent1Output(base({ sector_impacts: "banking" }), HELD);
  assert.equal("sector_impacts" in out2, false);
  assert.equal(out2.normalization_notes.length, 1);
});

test("non-array affected_tickers / affected_sectors become [] (matching would throw)", () => {
  const out = normalizeAgent1Output(base({ affected_tickers: "KBANK", affected_sectors: "banking" }), HELD);
  assert.deepEqual(out.affected_tickers, []);
  assert.deepEqual(out.affected_sectors, []);
  assert.doesNotThrow(() => findAffectedClients(out));
});

test("invalid event_scope is removed (matching defaults to systemic)", () => {
  for (const event_scope of ["global", "", 5, null, ["sector"]]) {
    const out = normalizeAgent1Output(base({ event_scope }), HELD);
    assert.equal("event_scope" in out, false, String(event_scope));
    assert.equal(out.normalization_notes.length, 1);
  }
  const cased = normalizeAgent1Output(base({ event_scope: " Sector " }), HELD);
  assert.equal(cased.event_scope, "sector");
  assert.equal(cased.normalization_notes.length, 1);
});

test("single_company with no tickers is downgraded to sector, with the reason", () => {
  const out = normalizeAgent1Output(
    base({
      event_scope: "single_company",
      affected_tickers: [],
      affected_sectors: ["property"],
      sector_impacts: [{ sector: "property", direction: "positive" }],
    }),
    HELD,
  );
  assert.equal(out.event_scope, "sector");
  assert.equal(out.normalization_notes.length, 1);
  assert.match(out.normalization_notes[0], /single_company/);

  const kept = normalizeAgent1Output(
    base({ event_scope: "single_company", affected_tickers: ["CPN"] }),
    HELD,
  );
  assert.equal(kept.event_scope, "single_company");
  assert.deepEqual(kept.normalization_notes, []);
});

test("does not mutate its input; non-object input is returned as-is", () => {
  const input = base({
    affected_sectors: ["Banking"],
    sector_impacts: [{ sector: "PROPERTY", direction: "x" }],
    event_scope: "nope",
  });
  const snapshot = structuredClone(input);
  normalizeAgent1Output(input, HELD);
  assert.deepEqual(input, snapshot);
  for (const v of [null, undefined, "x", 3, []]) {
    assert.equal(normalizeAgent1Output(v, HELD), v);
  }
});

test("idempotent: normalizing twice equals normalizing once (notes not duplicated)", () => {
  const messy = base({
    event_scope: "single_company",
    affected_tickers: [],
    affected_sectors: ["Banking", "banking", "retail"],
    sector_impacts: [
      { sector: "PROPERTY", direction: "up" },
      { sector: "property", direction: "positive" },
      { sector: "retail", direction: "positive" },
      null,
      { sector: "banking", direction: "Positive", extra: "x" },
    ],
  });
  const once = normalizeAgent1Output(messy, HELD);
  const twice = normalizeAgent1Output(once, HELD);
  assert.deepEqual(twice, once);
  assert.ok(once.normalization_notes.length > 0);
});

// --- Integration with findAffectedClients -------------------------------------------

const client = (clientId, holdings) => ({
  clientId,
  name: clientId,
  riskProfile: "moderate",
  aum: 1_000_000,
  holdings,
});

const book = [
  client("CPN_HOLDER", [
    { ticker: "CPN", name: "Central Pattana", sector: "property", weight: 0.5 },
    { ticker: "PTT", name: "PTT", sector: "energy", weight: 0.5 },
  ]),
  client("OTHER_PROPERTY", [
    { ticker: "LH", name: "Land & Houses", sector: "property", weight: 1 },
  ]),
  client("MIXED", [
    { ticker: "KBANK", name: "Kasikornbank", sector: "banking", weight: 0.4 },
    { ticker: "SPALI", name: "Supalai", sector: "property", weight: 0.3 },
    { ticker: "ADVANC", name: "AIS", sector: "telecom", weight: 0.3 },
  ]),
  client("TELECOM_ONLY", [
    { ticker: "TRUE", name: "True", sector: "telecom", weight: 1 },
  ]),
];

const run = (raw) => findAffectedClients(normalizeAgent1Output(raw, HELD), book);
const holdingsOf = (clients) =>
  Object.fromEntries(
    clients.map((c) => [
      c.clientId,
      c.matchedHoldings.map((h) => `${h.ticker}:${h.matchedBy}:${h.direction}`),
    ]),
  );

test("integration (a): single-company news matches only the named ticker's holders", () => {
  const out = run(
    base({
      sentiment: "positive",
      event_scope: "single_company",
      affected_tickers: ["CPN"],
      affected_sectors: ["property"],
      sector_impacts: [{ sector: "property", direction: "positive" }],
    }),
  );
  assert.deepEqual(holdingsOf(out), { CPN_HOLDER: ["CPN:ticker:positive"] });
});

test("integration (b): rate hike — banking positive, property negative", () => {
  const out = run(
    base({
      sentiment: "negative",
      event_scope: "systemic",
      affected_sectors: ["banking", "property"],
      sector_impacts: [
        { sector: "banking", direction: "positive" },
        { sector: "property", direction: "negative" },
      ],
    }),
  );
  assert.deepEqual(holdingsOf(out), {
    CPN_HOLDER: ["CPN:sector:negative"],
    OTHER_PROPERTY: ["LH:sector:negative"],
    MIXED: ["KBANK:sector:positive", "SPALI:sector:negative"],
  });
  // Gross exposure: +0.4 and −0.3 both count.
  assert.equal(out.find((c) => c.clientId === "MIXED").priorityScore, 0.7);
});

test("integration (c): sector omitted from affected_sectors but in sector_impacts is still matched", () => {
  const raw = base({
    sentiment: "negative",
    event_scope: "systemic",
    affected_sectors: ["banking"],
    sector_impacts: [
      { sector: "banking", direction: "positive" },
      { sector: "telecom", direction: "negative" },
    ],
  });
  // Without normalization the telecom-only client silently drops off.
  assert.ok(!findAffectedClients(raw, book).some((c) => c.clientId === "TELECOM_ONLY"));

  const out = run(raw);
  assert.deepEqual(holdingsOf(out).TELECOM_ONLY, ["TRUE:sector:negative"]);
  assert.deepEqual(holdingsOf(out).MIXED, ["KBANK:sector:positive", "ADVANC:sector:negative"]);
});
