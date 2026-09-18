---
name: dislocation-analysis
description: Reference for detecting market dislocations — when actual market reaction to news diverges from the theoretically expected reaction. Use when analyzing news impact, flagging trading ideas, or reasoning about macro-to-sector effects in Thai markets.
---

# Dislocation Analysis

## 1. Definition

A **dislocation** occurs when a market's *actual* reaction to news diverges
from its *theoretically expected* reaction.

News does not just carry information — it carries an implied prediction of how
prices should move. When the market moves differently than theory predicts, the
gap itself is the signal. A dislocation is not noise to be smoothed away; it is
a potential trading idea, because it means the market is either mispricing the
event or pricing in something the headline does not mention.

> The value is not in reading the news. Clients can read the news. The value is
> in noticing where the market's reaction contradicts what the news *should*
> have done.

## 2. Methodology (K Asset investment strategist)

A three-step process used by buy-side strategists to convert a news event into a
tactical call.

**Step 1 — State what SHOULD happen.**
Reason from macro/news logic to a directional expectation *before* looking at
prices. Be explicit about the causal chain.
- Example: "This is a risk-off event → investors flee to safety → safe havens
  like gold and US Treasuries should rise, equities should fall."

**Step 2 — Compare against actual market movement.**
Pull the real price action from the market outcome data and line it up
factor-by-factor against the Step 1 expectation.
- Did equities fall? (expected: yes)
- Did gold rise? (expected: yes)
- Did bonds rally? (expected: yes)

**Step 3 — If actual diverges from expected, flag as a dislocation.**
Any factor that moved *against* its expected direction is flagged. Treat the
divergence as a potential trading idea, not an error in the data. Ask: what
would the market have to believe for this move to make sense? That hidden belief
is the opportunity.

## 3. Reference Case — April 2025 Tariff Shock (canonical example)

A global tariff announcement is an archetypal risk-off event.

| Factor | Expected (theory) | Actual | Dislocation? |
|---|---|---|---|
| Global equities | Fall | Fell | No — as expected |
| Gold | Rise (safe haven) | **Fell −2.3%** | **YES** |
| US 10Y Treasuries | Rally / yields fall | **Sold off** | **YES** |

Under standard risk-off logic, gold and US government bonds — the two classic
safe havens — should have risen. Instead **both fell**: gold dropped −2.3% and
the US 10-year sold off. Safe havens declining *during* a risk-off shock is the
dislocation. It suggested forced liquidation / a dash for cash rather than an
orderly flight to safety — and marked gold's decline as a possible mispricing
rather than a warning sign.

This is our canonical worked example. Any new case should be reasoned through
the same table format.

## 4. Thai Market Sector → Macro-Factor Mappings

Use these to build the Step 1 expectation when Thai (SET) holdings are involved.
State the direction of the driver *and* the direction of the sector response.

This is the SAME text the Agent 1 and Agent 2 prompts use — it is the
`SECTOR_MECHANISM_TABLE` constant in `api/claude-agent.js`, injected verbatim
into both prompts so the analyst and the fact checker share one definition of
each sector (e.g. which sectors are bond proxies). Edit the constant and this
block together; `tests/claude-agent.test.js` fails if they drift.

```text
- Banking (KBANK, SCB, BBL): interest rates — POSITIVE (higher rates widen net interest margins).
- Energy / Oil & Gas (PTT, PTTEP): crude oil price — POSITIVE (revenue tracks oil).
- Property (LH, AP, SPALI, CPN): interest rates — INVERSE (rate hikes raise mortgage costs).
- Utilities / Power (GULF, GPSC): interest rates — INVERSE (bond proxy: capital-heavy, stable cash flows).
- Telecom (ADVANC, TRUE, INTUCH): interest rates — INVERSE (bond proxy: stable cash flows, high dividends, high leverage).
- Tourism / Airports (AOT, MINT, CENTEL): baht FX, oil, travel demand — weaker baht + lower oil = POSITIVE.
- Exporters / Electronics (DELTA, KCE): baht FX — INVERSE to baht strength (weaker baht boosts export revenue).
- Retail / Consumer (CPALL, CRC, HMPRO): domestic consumption — POSITIVE to spending, INVERSE to rate hikes.
- Healthcare (BDMS, BH): defensive — low macro sensitivity, outperforms in risk-off.
Bond proxies are ONLY the sectors labelled "bond proxy" above (utilities/power and telecom). Transport and property are rate-sensitive for other reasons (debt-funded infrastructure, mortgage costs) and are not bond proxies.
Rate rule of thumb: rate hikes help banks, hurt property / utilities / telecom / rate-sensitive growth; rate cuts do the reverse.
```

## 5. Output Guidance

Every dislocation assessment must explicitly state all three of the following.
Do not collapse them — the separation between (a) and (b) *is* the analysis.

**(a) What was expected.**
The theory-driven directional call from Step 1, with the causal chain named.

**(b) What actually happened.**
The observed market movement from the outcome data, with magnitudes where
available.

**(c) Confidence: genuine dislocation vs. normal noise.**
State how confident you are that (a) and (b) genuinely diverge, versus the move
being within normal market noise. Consider:
- **Magnitude** — is the divergence large relative to the asset's typical daily
  range, or within it?
- **Breadth** — did multiple correlated factors diverge together (higher
  confidence, as in the Tariff case) or just one in isolation (likely noise)?
- **Alternative explanations** — is there a simpler cause (unrelated news, a
  data artifact, a known technical flow) that explains the move without a true
  dislocation?

**Limits (enforced in the Agent 1 prompt and checked by Agent 2, check 6).**
The description and reasoning use only facts from the news content and market
outcome, plus mechanisms from the §4 table. They never contradict explicit forward
guidance in the source (e.g. if the dot plot signals another hike, do not infer the
rate cycle has peaked), and they never suggest an action — buy, sell, accumulate,
reduce, add, trim, take profit, rebalance, or Thai equivalents (ซื้อ, ขาย, สะสม,
ทยอยสะสม, ลดสัดส่วน, เพิ่มสัดส่วน, ขายทำกำไร). Say what the gap may indicate, never
what to do about it.

Frame the confidence honestly. A flagged dislocation that turns out to be noise
wastes an RM's most valuable resource — a client's attention — so it is better
to label a borderline case as low-confidence than to overstate it.

## 6. Ticker / Sector Expansion Is Agent 1's Job — Out of Scope for the Fact Check

**Design decision (recorded so it isn't buried in a prompt string).**

Building `affected_tickers` and `affected_sectors` is **Agent 1's** responsibility.
Agent 1 is *expected* to expand from the news to the specific SET tickers and
sectors it touches, using the Section 4 sector→macro-factor mappings. A
risk-off / tariff event legitimately reaches banking, property, healthcare,
energy, and transport through second-order effects **even when the news text
only names "exporters."** That expansion is analysis, not fabrication.

Those lists then feed the **deterministic matcher (`matching.js`)**, which is the
**single source of truth** for client exposure ("who holds what, who do we call
first"). The lists are matching inputs — they are not client-facing claims that
need sourcing.

**Therefore Agent 2 (the fact checker) must NOT verify or flag ticker/sector
expansion.** Agent 2 sees only the news + market outcome — not the holdings
universe and not these sector mappings — so it is structurally *unable* to judge
those lists, and flagging them produced false `is_valid: false` results on the
canonical Tariff case. Agent 2's scope is deliberately narrowed to the claims it
*can* judge from the source alone:

| Claim | Who owns it | In fact-check scope? |
|---|---|---|
| `dislocation_detected` + `dislocation_description` | Agent 1 narrative | **Yes** — verify against market outcome |
| `sentiment` (expected, pre-reaction net impact) | Agent 1 narrative | **Yes** — only for inconsistency with the `sector_impacts` directions; never for diverging from the actual market reaction when a dislocation is described (that gap IS the dislocation) |
| `reasoning` grounding (numbers, price moves, named precedents) | Agent 1 narrative | **Yes** — flag invented facts / dated reference cases |
| `event_scope` | Agent 1 classification | **Yes** — is it consistent with the news text? (§7) |
| `sector_impacts[].direction` + `reason` (non-neutral entries) | Agent 1 narrative | **Yes** — blocking if the reason is missing, contradicts the source, adds facts not in the source, or uses a mechanism that does not fit the sector |
| `affected_tickers`, `affected_sectors`, *which* sectors appear in `sector_impacts` | Agent 1 mapping → `matching.js` | **No** — expected expansion, judged by the deterministic matcher, not the fact checker |

Rule of thumb: the fact check verifies the **story** (is the dislocation real,
is the direction right, are the facts invented?), not the **tagging** (which
tickers/sectors) — the tagging is deterministic downstream and needs no LLM sign-off.

**Sector reasons — what is and is not a problem.** A general, sector-appropriate
economic mechanism ("higher rates raise borrowing costs" for property) is fine
even though the news does not spell it out. A mechanism attached to the wrong
sector is not: "bond proxy" fits telecom (stable cash flows, high dividends, high
leverage) and utilities, but not transport — the Phase 3.1 live run called
transport a bond proxy; the Phase 3.2 run's transport reason (heavily indebted
infrastructure operators) and telecom-as-bond-proxy are both sound. Neutral
entries are not checked.

**Source-only verification.** Agent 2 judges claims only against the provided
news content and market outcome. It must never flag a name, date, figure or
event as wrong from its own background knowledge, which may be outdated (e.g. a
rate level or a policy decision newer than the model's training data).

**Verdict consistency.** `flagged_issues` lists only problems that should block
CIO approval — an observation the model concludes is acceptable is not listed.
The server enforces the verdict deterministically (`normalizeAgent2Output`):
`is_valid` is true iff `flagged_issues` is empty, and any correction is shown to
the CIO in `factcheck_normalization_notes`. (Phase 3 live run: a Fed-hike item
came back `is_valid: false` with issues the model itself called "not a real
problem" — this guard makes that impossible.)

## 7. Event Scope and Sector Direction (Agent 1 output)

Agent 1 classifies how far a news event should expand **before** tagging, and
states a direction per sector. Both feed `matching.js`.

| `event_scope` | Meaning | Expansion |
|---|---|---|
| `single_company` | News about one named company (a deal, earnings, a contract) | None — matching uses tickers only, so the rest of the sector is not swept in |
| `sector` | News about one industry as a whole | That sector only — no second-order sectors |
| `systemic` | Macro / market-wide (rates, tariffs, FX, oil shocks, risk-off) | Second-order expansion via the §4 mappings, justified in `reasoning` |

- **`sector_impacts`** — one `{ sector, direction, reason }` per affected
  sector, using only the held sectors from the holdings summary. Mixed directions
  are normal: a rate hike is `banking: positive`, `property: negative` at once
  (§4 rule of thumb). Top-level `sentiment` is only the net read and never
  overrides them. `reason` is one short Thai sentence giving the mechanism —
  only facts from the news / market outcome plus general economic mechanisms,
  and a mechanism that fits that sector (§4). It is shown to the CIO under each
  sector and passed to Agent 3 as the holding's "sector mechanism".
- **`neutral` means "does not select clients".** A sector tagged neutral is
  listed for the reviewer but removed from matching (below).
- **Stability** — Agents 1 and 2 run at `temperature: 0`, which reduces but does
  not eliminate flips. N006 healthcare was `positive` in one live run and
  `neutral` in the next, which re-ranked four clients (see CLAUDE.md → Known
  Limitations → ranking variance). Accepted; a cache regen shows a ranking diff
  for human review instead of requiring an identical ranking.
- **Ticker discipline** — for `systemic` / `sector` events, `affected_tickers`
  lists only companies named in the news or with company-specific exposure stated
  in the reasoning. Sector-wide exposure belongs in `affected_sectors` /
  `sector_impacts`; the matcher already reaches every holder of the sector. This
  is prompt guidance only — no server-side cap, because a cap cannot tell a sweep
  from a legitimately named list and would silently drop a company.
  (Live 2026-09-17: N006 went from 22 tickers to 0; the client list was unchanged.)

**Server-side normalization (`normalizeAgent1Output`)** makes these fields
consistent before matching, and lists every change in `normalization_notes` for
the CIO:
- sector strings lowercased/trimmed; unheld or malformed `sector_impacts` entries
  dropped; invalid direction → `neutral`; duplicate sector → first entry wins;
- **reason** — trimmed, capped at 300 chars; a non-neutral entry with a missing or
  blank reason is **kept** (dropping it would silently remove clients) and noted;
- **union** — every non-neutral `sector_impacts` sector is added to
  `affected_sectors` (otherwise its holders would silently drop off the call
  list); no direction is invented for a sector without one;
- **neutral removal** — then every sector with an explicit neutral entry is
  removed from `affected_sectors` (the one case where a sector is removed); the
  entry stays in `sector_impacts` for display. Sectors without an entry are
  untouched, and a named ticker in a neutral sector still matches by ticker;
- invalid `event_scope` → removed (matching treats it as `systemic`);
- **`single_company` is never rewritten** to another scope — widening it would
  re-create the sector sweep. If no listed ticker is held (or the list is empty),
  the client list is empty and a note tells the CIO why.
