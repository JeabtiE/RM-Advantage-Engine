// Agent 1 post-parse normalization (api/claude-agent.js) and its hand-off to
// matching.js. Pure deterministic JS: no network, no API key.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeAgent1Output,
  heldSectorsFromSummary,
  heldTickersFromSummary,
  normalizeAgent2Output,
  MAX_SECTOR_REASON_CHARS,
} from "../api/claude-agent.js";
import { buildHoldingsSummary, findAffectedClients } from "../src/utils/matching.js";
import { getAllSectors, getAllTickers, mockClients } from "../src/data/mockClients.js";
import { cachedDemoRuns } from "../src/data/cachedDemoRun.js";

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
      { sector: "banking", direction: "positive", reason: "ดอกเบี้ยสูงขึ้นขยายส่วนต่างดอกเบี้ย" },
      { sector: "property", direction: "negative", reason: "ต้นทุนสินเชื่อที่อยู่อาศัยสูงขึ้น" },
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
        { sector: "banking", direction: "positive", reason: "r1" },
        { sector: "property", direction: "negative", reason: "r2" },
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

test("unknown direction becomes neutral with a note (and, being neutral, stops driving matching)", () => {
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
  assert.deepEqual(out.affected_sectors, []);
  // 2 direction notes + 1 note naming both removed sectors.
  assert.equal(out.normalization_notes.length, 3);
  assert.match(out.normalization_notes[2], /banking, energy/);
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
  // Full-string equality, not a substring probe: this pins the exact wording
  // AND surfaces the second note the old `includes("ซ้ำ")` check silently missed.
  assert.deepEqual(out.normalization_notes, [
    'Sector "property" (negative) has no reason — check before approving',
    'Dropped duplicate sector_impacts "property" (kept the first)',
  ]);
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

// --- single_company: never downgraded -------------------------------------------------

const HELD_TICKERS = heldTickersFromSummary(buildHoldingsSummary());

test("heldTickersFromSummary reads every held ticker", () => {
  assert.equal(HELD_TICKERS.size, getAllTickers().length);
  assert.ok(HELD_TICKERS.has("AP") && HELD_TICKERS.has("PTTEP") && HELD_TICKERS.has("PTT"));
});

for (const [label, affected_tickers] of [
  ["empty tickers", []],
  ["only unheld tickers", ["CRC", "HMPRO"]],
]) {
  test(`single_company with ${label}: scope kept, note present, zero clients matched`, () => {
    const out = normalizeAgent1Output(
      base({
        event_scope: "single_company",
        affected_tickers,
        affected_sectors: ["property"],
        sector_impacts: [{ sector: "property", direction: "positive", reason: "r" }],
      }),
      HELD,
      HELD_TICKERS,
    );
    assert.equal(out.event_scope, "single_company");
    assert.deepEqual(out.normalization_notes, [
      "single_company news, but no client holds the named company — the client list is empty",
    ]);
    assert.deepEqual(findAffectedClients(out, mockClients), []);
  });
}

test("single_company with a held ticker: scope kept, no note", () => {
  const out = normalizeAgent1Output(
    base({ event_scope: "single_company", affected_tickers: ["crc", "cpn"] }),
    HELD,
    HELD_TICKERS,
  );
  assert.equal(out.event_scope, "single_company");
  assert.deepEqual(out.normalization_notes, []);
});

test("single_company without heldTickers argument: only an empty list is noted", () => {
  const empty = normalizeAgent1Output(base({ event_scope: "single_company" }), HELD);
  assert.equal(empty.event_scope, "single_company");
  assert.equal(empty.normalization_notes.length, 1);
  const named = normalizeAgent1Output(base({ event_scope: "single_company", affected_tickers: ["CRC"] }), HELD);
  assert.deepEqual(named.normalization_notes, []);
});

// --- Neutral sectors do not drive matching --------------------------------------------

test("explicit neutral sector is removed from affected_sectors, kept in sector_impacts, with a note", () => {
  const out = normalizeAgent1Output(
    base({
      affected_sectors: ["banking", "energy", "healthcare"],
      sector_impacts: [
        { sector: "banking", direction: "positive", reason: "r" },
        { sector: "energy", direction: "neutral" },
        { sector: "healthcare", direction: "neutral", reason: "defensive" },
      ],
    }),
    HELD,
  );
  assert.deepEqual(out.affected_sectors, ["banking"]);
  assert.deepEqual(out.sector_impacts.map((s) => s.sector), ["banking", "energy", "healthcare"]);
  assert.equal(out.normalization_notes.length, 1, "neutral entries need no reason");
  assert.match(out.normalization_notes[0], /energy, healthcare/);
});

test("a neutral sector only in sector_impacts is not added by the union", () => {
  const out = normalizeAgent1Output(
    base({
      affected_sectors: ["banking"],
      sector_impacts: [
        { sector: "banking", direction: "positive", reason: "r" },
        { sector: "telecom", direction: "neutral" },
      ],
    }),
    HELD,
  );
  assert.deepEqual(out.affected_sectors, ["banking"]);
  assert.deepEqual(out.normalization_notes, [], "nothing was added or removed");
});

test("sectors without a sector_impacts entry are untouched; a named ticker in a neutral sector still matches", () => {
  const out = normalizeAgent1Output(
    base({
      sentiment: "positive",
      affected_tickers: ["PTT"],
      affected_sectors: ["banking", "energy"],
      sector_impacts: [{ sector: "energy", direction: "neutral" }],
    }),
    HELD,
  );
  assert.deepEqual(out.affected_sectors, ["banking"]);
  const matched = findAffectedClients(out, [
    {
      clientId: "P",
      aum: 1,
      holdings: [
        { ticker: "PTT", name: "PTT", sector: "energy", weight: 0.5 },
        { ticker: "GULF", name: "Gulf", sector: "energy", weight: 0.2 },
        { ticker: "KBANK", name: "K", sector: "banking", weight: 0.3 },
      ],
    },
  ]);
  assert.deepEqual(
    matched[0].matchedHoldings.map((h) => `${h.ticker}:${h.matchedBy}:${h.direction}`),
    ["PTT:ticker:neutral", "KBANK:sector:positive"],
  );
});

// --- Per-sector reason -------------------------------------------------------------------

test("missing / blank reason on a non-neutral entry: entry kept, note names the sector", () => {
  const out = normalizeAgent1Output(
    base({
      affected_sectors: ["banking", "property"],
      sector_impacts: [
        { sector: "banking", direction: "positive" },
        { sector: "property", direction: "negative", reason: "   " },
      ],
    }),
    HELD,
  );
  assert.deepEqual(out.sector_impacts, [
    { sector: "banking", direction: "positive" },
    { sector: "property", direction: "negative" },
  ]);
  assert.deepEqual(out.affected_sectors, ["banking", "property"]);
  assert.equal(out.normalization_notes.length, 2);
  assert.match(out.normalization_notes[0], /banking/);
  assert.match(out.normalization_notes[1], /property/);
});

test("reasons are trimmed and capped; a non-string reason is removed with a note", () => {
  const long = "ก".repeat(MAX_SECTOR_REASON_CHARS + 50);
  const out = normalizeAgent1Output(
    base({
      affected_sectors: ["banking", "property", "energy"],
      sector_impacts: [
        { sector: "banking", direction: "positive", reason: "  สั้น  " },
        { sector: "property", direction: "negative", reason: long },
        { sector: "energy", direction: "negative", reason: 42 },
      ],
    }),
    HELD,
  );
  assert.equal(out.sector_impacts[0].reason, "สั้น");
  assert.equal(out.sector_impacts[1].reason.length, MAX_SECTOR_REASON_CHARS);
  assert.ok(out.sector_impacts[1].reason.endsWith("…"));
  assert.equal("reason" in out.sector_impacts[2], false);
  assert.ok(out.normalization_notes.some((n) => n.includes("property")));
  assert.ok(out.normalization_notes.filter((n) => n.includes("energy")).length === 2);
});

// --- Cached-run regression -----------------------------------------------------------------

test("cached analyses are unchanged by normalization and still yield the cached ranking", () => {
  for (const [id, run] of Object.entries(cachedDemoRuns)) {
    const out = normalizeAgent1Output(run.analysis, HELD, HELD_TICKERS);
    // Pre-Phase-3 items gain an empty notes list; items cached after Phase 3
    // (N007) were already normalized, so idempotency leaves them identical.
    assert.deepEqual(
      out,
      { ...run.analysis, normalization_notes: run.analysis.normalization_notes ?? [] },
      id,
    );
    const ranked = findAffectedClients(out).sort((a, b) => b.priorityScore - a.priorityScore);
    assert.deepEqual(
      ranked.map((c) => [c.clientId, c.priorityScore]),
      run.affectedClients.map((c) => [c.clientId, c.priorityScore]),
      id,
    );
  }
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
  const messies = [
    base({
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
    }),
    base({
      event_scope: "Single_Company",
      affected_tickers: ["CRC"],
      affected_sectors: ["energy", "telecom"],
      sector_impacts: [
        { sector: "energy", direction: "neutral", reason: " x " },
        { sector: "banking", direction: "positive", reason: "ก".repeat(MAX_SECTOR_REASON_CHARS * 2) },
        { sector: "property", direction: "negative", reason: "" },
        { sector: "technology", direction: "neutral" },
        { sector: "transport", direction: "negative", reason: 1 },
      ],
    }),
  ];
  for (const messy of messies) {
    const once = normalizeAgent1Output(messy, HELD, HELD_TICKERS);
    const twice = normalizeAgent1Output(once, HELD, HELD_TICKERS);
    assert.deepEqual(twice, once);
    assert.ok(once.normalization_notes.length > 0);
  }
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

test("integration (d): FOMC-style — a client whose matched sectors are all neutral is not matched", () => {
  const out = run(
    base({
      sentiment: "negative",
      event_scope: "systemic",
      affected_sectors: ["banking", "property", "energy", "telecom"],
      sector_impacts: [
        { sector: "banking", direction: "positive", reason: "r" },
        { sector: "property", direction: "negative", reason: "r" },
        { sector: "energy", direction: "neutral" },
        { sector: "telecom", direction: "neutral" },
      ],
    }),
  );
  // TELECOM_ONLY holds only a neutral sector -> gone. MIXED keeps its
  // non-neutral holdings only, so its gross score shrinks accordingly.
  assert.deepEqual(holdingsOf(out), {
    CPN_HOLDER: ["CPN:sector:negative"],
    OTHER_PROPERTY: ["LH:sector:negative"],
    MIXED: ["KBANK:sector:positive", "SPALI:sector:negative"],
  });
  assert.equal(out.find((c) => c.clientId === "CPN_HOLDER").priorityScore, 0.5);
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

// --- Agent 2 consistency guard ------------------------------------------------------

test("agent2 guard: empty issues + is_valid false -> true, with a note", () => {
  const out = normalizeAgent2Output({ is_valid: false, flagged_issues: [], adjusted_reasoning: "r" });
  assert.equal(out.is_valid, true);
  assert.equal(out.factcheck_normalization_notes.length, 1);
  assert.equal(out.adjusted_reasoning, "r");
});

test("agent2 guard: missing issues -> is_valid true, issues []", () => {
  const out = normalizeAgent2Output({ is_valid: false, adjusted_reasoning: "r" });
  assert.equal(out.is_valid, true);
  assert.deepEqual(out.flagged_issues, []);
  assert.equal(out.factcheck_normalization_notes.length, 1);
});

test("agent2 guard: non-empty issues + is_valid true -> false, with a note", () => {
  const out = normalizeAgent2Output({ is_valid: true, flagged_issues: ["x"], adjusted_reasoning: "r" });
  assert.equal(out.is_valid, false);
  assert.equal(out.factcheck_normalization_notes.length, 1);
  assert.match(out.factcheck_normalization_notes[0], /false/);
});

test("agent2 guard: consistent input unchanged, no notes", () => {
  for (const input of [
    { is_valid: true, flagged_issues: [], adjusted_reasoning: "r" },
    { is_valid: false, flagged_issues: ["a", "b"], adjusted_reasoning: "r2" },
  ]) {
    assert.deepEqual(normalizeAgent2Output(input), { ...input, factcheck_normalization_notes: [] });
  }
});

test("agent2 guard: malformed issues are cleaned and is_valid derived from what remains", () => {
  const blanks = normalizeAgent2Output({ is_valid: false, flagged_issues: ["", "  ", 3, null] });
  assert.deepEqual(blanks.flagged_issues, []);
  assert.equal(blanks.is_valid, true);
  assert.equal(blanks.factcheck_normalization_notes.length, 2);

  const bare = normalizeAgent2Output({ is_valid: true, flagged_issues: "ตัวเลขไม่มีในข่าว" });
  assert.deepEqual(bare.flagged_issues, ["ตัวเลขไม่มีในข่าว"]);
  assert.equal(bare.is_valid, false);

  const junk = normalizeAgent2Output({ is_valid: "yes", flagged_issues: { a: 1 } });
  assert.deepEqual(junk.flagged_issues, []);
  assert.equal(junk.is_valid, true);
});

test("agent2 guard: idempotent and does not mutate input", () => {
  for (const input of [
    { is_valid: true, flagged_issues: "one" },
    { is_valid: false, flagged_issues: [] },
    { is_valid: "no", flagged_issues: ["", "real"] },
  ]) {
    const snapshot = structuredClone(input);
    const once = normalizeAgent2Output(input);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(normalizeAgent2Output(once), once);
  }
  for (const v of [null, undefined, "x", []]) assert.equal(normalizeAgent2Output(v), v);
});
