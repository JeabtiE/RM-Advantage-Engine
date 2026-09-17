// matching.js — deterministic client matching (NO AI — plain filter/some).
//
// After Agent 1 flags what a news event affects (tickers + sectors), this
// module answers the RM's real question: "Of my ~300 clients, who is actually
// exposed, and who do I call FIRST?" All logic here is deterministic JS so the
// same Agent 1 output always yields the same ranked list — string matching must
// never depend on an LLM (see CLAUDE.md hard constraint #6).
//
//   findAffectedClients() — match affected tickers/sectors to client holdings
//                           (event-scope gated, each match tagged with direction).
//   calculatePriority()   — % of a client's portfolio hit by the matched holdings.
//   buildHoldingsSummary() — compact holdings universe fed into Agent 1's prompt.
//   filterRelevantNews()  — cheap pre-Agent-1 relevance floor (skips the API call).

import { mockClients, getAllTickers, getAllSectors } from "../data/mockClients.js";

// buildHoldingsSummary — one line per UNIQUE ticker across the whole book:
// "TICKER (name, sector)". This is the "universe clients actually hold" that
// Agent 1 matches the news against, so it never invents a ticker nobody owns.
// (Lives here as the canonical home; the node test imports it from this module.)
export function buildHoldingsSummary(clients = mockClients) {
  const seen = new Map(); // ticker -> "TICKER (name, sector)"
  for (const client of clients) {
    for (const h of client.holdings) {
      if (!seen.has(h.ticker)) {
        seen.set(h.ticker, `${h.ticker} (${h.name}, ${h.sector})`);
      }
    }
  }
  return [...seen.values()].join("\n");
}

// Key Account tier (client-prioritization skill). A THRESHOLD, not a curve:
// every client over the bar gets the same flat boost regardless of how far over
// they are, because that is how RMs actually tier the book (KKP mentor) — a 45M
// and an 11M client are both just "Key Accounts". Deliberately NOT aum/scale or
// any weighted average, which would rank on wealth alone.
export const KEY_ACCOUNT_AUM_THRESHOLD = 10_000_000; // THB
// UNITS: same scale as impactShare — a FRACTION in [0, 1], i.e. worth 15
// percentage points of portfolio impact. If impactShare is ever rescaled to
// 0-100, this MUST become 15 in the same commit: at 0.15 it would not throw,
// it would silently decay into a rounding error and the tier would stop working.
export const KEY_ACCOUNT_BOOST = 0.15;

export function isKeyAccount(client) {
  return Number(client?.aum ?? 0) >= KEY_ACCOUNT_AUM_THRESHOLD;
}

// calculateImpactShare — the share of a client's portfolio exposed to the news,
// as a fraction in [0, 1] (weights within a client sum to 1.0).
//
// This is the ONLY thing the UI may show as "% ของพอร์ต": it is a true, auditable
// fact about the client's actual holdings. priorityScore is NOT interchangeable
// with it — priorityScore carries the Key Account boost, so rendering that as a
// portfolio percentage would overstate real exposure (and could exceed 100%).
// Ranking uses priorityScore; the displayed percentage uses this. Exported so the
// components derive it from the same definition calculatePriority() uses rather
// than re-implementing the reduce and drifting.
export function calculateImpactShare(affectedHoldings = []) {
  return affectedHoldings.reduce((sum, h) => sum + h.weight, 0);
}

// calculatePriority — the automated ranking score (see the client-prioritization
// skill for the full formula and its rationale):
//
//   priorityScore = impactShare + (aum >= 10M ? 0.15 : 0)
//
// Term 1, impactShare: the share of a client's portfolio exposed to the news.
// Weights within a client sum to 1.0 (mockClients), so summing the matched
// holdings' weights gives a fraction in [0, 1] — directly the "% of portfolio
// affected". This term dominates: a non-Key-Account at 60% still outranks a Key
// Account at 20%. Exposure leads; the tier only adjusts.
//
// Term 2, the Key Account boost: flat +0.15 over the AUM bar, nothing under it.
// The 9,999,999-vs-10,000,001 cliff is accepted, not overlooked — it is inherent
// to a tier, and this is a ranking nudge, not a gate (a near-miss client with
// real exposure still appears on the list for the CIO to reorder by hand).
//
// Still NOT computed here (manual, Four Eyes): days since last contact, prior
// interest in the asset class, and judgment about clients just under the bar.
export function calculatePriority(client, affectedHoldings) {
  return (
    calculateImpactShare(affectedHoldings) +
    (isKeyAccount(client) ? KEY_ACCOUNT_BOOST : 0)
  );
}

/**
 * Agent 1 output as consumed by findAffectedClients. `event_scope` and
 * `sector_impacts` are OPTIONAL: Agent 1 starts emitting them in Phase 3, and
 * the cached demo runs (cachedDemoRun.js) predate them, so matching must behave
 * exactly as before when both are absent.
 *
 * @typedef {"positive" | "negative" | "neutral"} Direction
 * @typedef {"systemic" | "sector" | "single_company"} EventScope
 *
 * @typedef {Object} SectorImpact
 * @property {string} sector       - lowercase sector key, e.g. "banking"
 * @property {Direction} direction - how this event moves that sector
 *
 * @typedef {Object} Agent1Output
 * @property {string[]} affected_tickers
 * @property {string[]} affected_sectors
 * @property {Direction} sentiment               - net direction for affected holdings
 * @property {boolean} dislocation_detected
 * @property {string} dislocation_description
 * @property {string} reasoning
 * @property {EventScope} [event_scope]          - missing → "systemic"
 * @property {SectorImpact[]} [sector_impacts]   - per-sector direction; missing → sentiment
 */

/**
 * A matched holding: the client's holding plus why it matched and which way the
 * event pushes it.
 *
 * @typedef {Object} MatchedHolding
 * @property {string} ticker
 * @property {string} name
 * @property {string} sector
 * @property {number} weight
 * @property {"ticker" | "sector"} matchedBy - "ticker" wins when both match
 * @property {Direction} direction
 */

const DIRECTIONS = new Set(["positive", "negative", "neutral"]);
const EVENT_SCOPES = new Set(["systemic", "sector", "single_company"]);

// Anything that isn't a known direction reads as "neutral" — a malformed value
// from the model must degrade to "no directional claim", never throw mid-demo.
function toDirection(value) {
  const d = String(value ?? "").toLowerCase();
  return DIRECTIONS.has(d) ? d : "neutral";
}

// Missing OR unrecognized scope → "systemic", the pre-Phase-3 behavior. Falling
// back to the widest scope keeps an odd model response from silently dropping
// clients; over-inclusion is visible to the CIO, omission is not.
function toEventScope(value) {
  const s = String(value ?? "").toLowerCase();
  return EVENT_SCOPES.has(s) ? s : "systemic";
}

// sector → direction from sector_impacts. Malformed entries (not an object, no
// non-empty string sector) are skipped; the first entry for a sector wins so a
// duplicate can't flip the answer depending on order of evaluation elsewhere.
function buildSectorDirections(sectorImpacts) {
  const map = new Map();
  if (!Array.isArray(sectorImpacts)) return map;
  for (const entry of sectorImpacts) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.sector !== "string" || entry.sector.trim() === "") continue;
    const sector = entry.sector.trim().toLowerCase();
    if (!map.has(sector)) map.set(sector, toDirection(entry.direction));
  }
  return map;
}

// findAffectedClients — match Agent 1's output against every client's holdings.
//
// Scope gate (event_scope):
//   "systemic" / "sector" (and missing) — a holding matches if its ticker is in
//     affected_tickers OR its sector is in affected_sectors (the original rule).
//     The two scopes match identically today; the distinction is carried for
//     Agent 1 / the reviewer, not used to narrow further.
//   "single_company" — ticker only. Sector expansion is what over-included
//     clients on single-company news (README Known Limitation #1): a CPN deal
//     must not sweep in every property holder.
//
// Only affected_sectors decides whether a sector MATCHES; sector_impacts only
// supplies its DIRECTION. Letting sector_impacts widen the match would reopen
// the over-inclusion this gate exists to close.
//
// Direction per matched holding: the holding's sector in sector_impacts, else
// the top-level sentiment, else "neutral". The same rule covers ticker matches
// (their sector's direction if known) and sectors only listed in
// affected_sectors (they inherit sentiment).
//
// Matching is case-insensitive (tickers upper, sectors lower) so a stray-case
// Agent 1 response still matches. Returns ONLY clients with at least one matched
// holding, each annotated with matchedHoldings and a priorityScore. Caller sorts
// by priorityScore (useDraft / the regen script do this).
//
// @param {Agent1Output} agent1Output
// @returns {Array<Object & { matchedHoldings: MatchedHolding[], priorityScore: number }>}
export function findAffectedClients(agent1Output, clients = mockClients) {
  const tickers = new Set(
    (agent1Output?.affected_tickers ?? []).map((t) => String(t).toUpperCase()),
  );
  const scope = toEventScope(agent1Output?.event_scope);
  const sectors =
    scope === "single_company"
      ? new Set()
      : new Set(
          (agent1Output?.affected_sectors ?? []).map((s) => String(s).toLowerCase()),
        );
  const sectorDirections = buildSectorDirections(agent1Output?.sector_impacts);
  const fallbackDirection = toDirection(agent1Output?.sentiment);

  const affected = [];
  for (const client of clients) {
    const matchedHoldings = [];
    for (const h of client.holdings) {
      const byTicker = tickers.has(String(h.ticker).toUpperCase());
      const sector = String(h.sector).toLowerCase();
      if (!byTicker && !sectors.has(sector)) continue;
      matchedHoldings.push({
        ...h,
        matchedBy: byTicker ? "ticker" : "sector",
        direction: sectorDirections.get(sector) ?? fallbackDirection,
      });
    }
    if (matchedHoldings.length === 0) continue;

    affected.push({
      ...client,
      matchedHoldings,
      // GROSS exposure — positive and negative holdings both add weight, they are
      // never netted. A client long banks (+) and property (−) on a rate hike may
      // net to roughly zero P&L, but still needs an RM conversation: the mix
      // inside the portfolio shifted, and that is exactly the insight to relay.
      priorityScore: calculatePriority(client, matchedHoldings),
    });
  }
  return affected;
}

// --- Pre-Agent-1 relevance filter ------------------------------------------
//
// filterRelevantNews() is a RELEVANCE FLOOR, not a precision instrument. It
// exists for one purpose: don't burn an Agent 1 API call on news with zero
// possible bearing on the book (a marathon result, a celebrity story). Anything
// that could plausibly reach a client's portfolio must pass.
//
// WHY THE BIAS IS DELIBERATELY TOWARD PASSING: the two error costs are wildly
// asymmetric. A false positive costs ONE API call — the very thing this filter
// saves, so the worst case is breaking even. A false negative silently destroys
// the product's whole value proposition: the insight the market missed never
// gets analyzed, and nothing in the UI says why. When in doubt, pass it through
// and let Agent 1 (which reasons) decide.
//
// WHY MACRO KEYWORDS EXIST AND NOT JUST SECTORS/TICKERS: matching on tickers +
// the seven held sectors ALONE would reject N006, the Tariff/Gold money shot —
// its headline+content name no ticker and no held sector, only tariffs, exports,
// risk-off, gold and bonds. Per the dislocation-analysis skill (§6), expanding
// macro news to the sectors it touches is precisely Agent 1's job: a risk-off
// event legitimately reaches banking, property, healthcare and energy through
// second-order effects "even when the news text only names 'exporters'". So
// keyword presence in the text is NOT what makes news relevant — this filter
// only screens out news with no macro or sector hook at all.

// Sector surface forms for the sectors clients actually hold (getAllSectors()).
const SECTOR_KEYWORDS = {
  banking: ["ธนาคาร", "แบงก์", "สินเชื่อ", "ส่วนต่างดอกเบี้ย", "bank", "banking"],
  energy: ["พลังงาน", "น้ำมัน", "ปิโตรเลียม", "ก๊าซ", "ไฟฟ้า", "โรงไฟฟ้า", "energy", "oil", "crude", "brent"],
  technology: ["เทคโนโลยี", "อิเล็กทรอนิกส์", "ชิ้นส่วน", "ชิป", "เซมิคอนดักเตอร์", "ศูนย์ข้อมูล", "ดาต้าเซ็นเตอร์", "ปัญญาประดิษฐ์", "technology", "electronics", "semiconductor", "ai"],
  property: ["อสังหา", "ที่อยู่อาศัย", "คอนโด", "บ้านจัดสรร", "นิคมอุตสาหกรรม", "property", "real estate"],
  healthcare: ["โรงพยาบาล", "สุขภาพ", "การแพทย์", "ผู้ป่วย", "เวชภัณฑ์", "healthcare", "hospital", "medical"],
  telecom: ["โทรคมนาคม", "มือถือ", "โทรศัพท์", "เครือข่าย", "อินเทอร์เน็ต", "คลื่นความถี่", "telecom"],
  transport: ["ขนส่ง", "สนามบิน", "ท่าอากาศยาน", "สายการบิน", "รถไฟฟ้า", "ทางด่วน", "โลจิสติกส์", "transport", "airline", "airport", "logistics"],
};

// Cross-sector macro drivers from the dislocation-analysis skill (§4 sector →
// macro-factor mappings, §3 risk-off reference case). These reach the book
// through second-order effects, so they count as relevant on their own —
// independent of which sectors the text happens to name. This is what keeps the
// Tariff case (N006) alive.
//
// rates also covers the US Fed: FOMC statements say "federal funds rate", not
// "interest rate", so English Fed news was being screened out. "fed" is a short
// ASCII term and will false-positive on phrases like "fed up" or "well-fed";
// that is accepted — the filter is deliberately biased toward passing (see
// above), and the cost of a false positive is one API call.
const MACRO_KEYWORDS = {
  rates: [
    "ดอกเบี้ย", "กนง.", "นโยบายการเงิน", "ธปท.", "ธนาคารแห่งประเทศไทย", "เงินเฟ้อ",
    "เฟด", "ธนาคารกลางสหรัฐ",
    "interest rate", "policy rate", "inflation",
    "fed", "fomc", "federal funds", "federal reserve", "rate hike", "rate cut",
  ],
  fx_trade: ["ค่าเงินบาท", "เงินบาท", "บาทแข็ง", "บาทอ่อน", "ส่งออก", "นำเข้า", "ภาษีนำเข้า", "ภาษีศุลกากร", "กำแพงภาษี", "การค้าโลก", "การค้าระหว่างประเทศ", "ห่วงโซ่อุปทาน", "tariff", "export", "import", "baht", "supply chain"],
  risk_off: ["risk-off", "risk off", "ทองคำ", "พันธบัตร", "สินทรัพย์ปลอดภัย", "สินทรัพย์เสี่ยง", "เทขาย", "gold", "treasury", "bond", "safe haven"],
  consumption: ["ค้าปลีก", "บริโภค", "กำลังซื้อ", "ท่องเที่ยว", "นักท่องเที่ยว", "โรงแรม", "วีซ่า", "retail", "consumption", "tourism", "tourist"],
};

const ASCII_ONLY = /^[\x00-\x7F]+$/;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// containsTerm — Thai has no word boundaries, so Thai terms are plain
// substrings. ASCII terms get \b...\b, otherwise short tickers and words like
// "ai" would fire inside unrelated English text ("said", "maintain"). \b also
// stops "PTT" matching inside "PTTEP" — Thai characters are non-word chars to
// JS regex, so a Latin term embedded in Thai still matches correctly.
function containsTerm(text, term) {
  if (ASCII_ONLY.test(term)) {
    return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text);
  }
  return text.includes(term);
}

// filterRelevantNews — deterministic keyword/ticker screen over headline +
// content. NO AI (CLAUDE.md hard constraint #6). Returns the match evidence so
// the UI can show WHY something was skipped rather than silently dropping it.
//
//   { relevant, reason, matchedTickers, matchedSectors, matchedMacroFactors }
export function filterRelevantNews(
  newsItem,
  allTickers = getAllTickers(),
  allSectors = getAllSectors(),
) {
  const text = `${newsItem?.headline ?? ""}\n${newsItem?.content ?? ""}`;

  const matchedTickers = allTickers.filter((t) => containsTerm(text, String(t)));

  // Only screen for sectors the book actually holds — a sector nobody owns is
  // not a reason to spend an API call.
  const matchedSectors = allSectors.filter((s) =>
    (SECTOR_KEYWORDS[String(s).toLowerCase()] ?? []).some((k) =>
      containsTerm(text, k),
    ),
  );

  const matchedMacroFactors = Object.entries(MACRO_KEYWORDS)
    .filter(([, keywords]) => keywords.some((k) => containsTerm(text, k)))
    .map(([factor]) => factor);

  const relevant =
    matchedTickers.length > 0 ||
    matchedSectors.length > 0 ||
    matchedMacroFactors.length > 0;

  if (!relevant) {
    return {
      relevant: false,
      reason:
        "ไม่เกี่ยวข้องกับฐานลูกค้า (not relevant to our client base) — " +
        "ไม่พบชื่อหุ้นที่ลูกค้าถือครอง sector ที่เกี่ยวข้อง หรือปัจจัยมหภาคที่ส่งผลต่อพอร์ต " +
        "จึงข้ามการวิเคราะห์ของ Agent 1",
      matchedTickers: [],
      matchedSectors: [],
      matchedMacroFactors: [],
    };
  }

  const hits = [
    matchedTickers.length ? `หุ้น: ${matchedTickers.join(", ")}` : null,
    matchedSectors.length ? `sector: ${matchedSectors.join(", ")}` : null,
    matchedMacroFactors.length
      ? `ปัจจัยมหภาค: ${matchedMacroFactors.join(", ")}`
      : null,
  ].filter(Boolean);

  return {
    relevant: true,
    reason: `เกี่ยวข้องกับฐานลูกค้า — ${hits.join(" | ")}`,
    matchedTickers,
    matchedSectors,
    matchedMacroFactors,
  };
}
