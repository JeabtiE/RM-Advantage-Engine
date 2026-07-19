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
orderly flight to safety — and framed gold's decline as a potential
accumulation opportunity rather than a warning sign.

This is our canonical worked example. Any new case should be reasoned through
the same table format.

## 4. Thai Market Sector → Macro-Factor Mappings

Use these to build the Step 1 expectation when Thai (SET) holdings are involved.
State the direction of the driver *and* the direction of the sector response.

| Sector | Primary macro factor | Relationship |
|---|---|---|
| Banking (KBANK, SCB, BBL) | Interest rates | **Positive** — higher rates widen net interest margins |
| Energy / Oil & Gas (PTT, PTTEP) | Crude oil price | **Positive** — revenue tracks oil prices |
| Property / Real estate (LH, AP, SPALI) | Interest rates | **Inverse** — rate hikes raise mortgage costs, cool demand |
| Utilities / Power (GULF, GPSC) | Interest rates | **Inverse** — capital-heavy, bond-proxy; hurt by rising rates |
| Tourism / Airlines / Hotels (AOT, MINT, CENTEL) | Baht FX, oil, travel demand | Weaker baht + lower oil = **positive**; strong baht/high oil = negative |
| Exporters (electronics, food) | Baht FX | **Inverse to baht strength** — weaker baht boosts export revenue |
| Retail / Consumer (CPALL, CRC, HMPRO) | Domestic consumption, rates | **Positive** to spending; **inverse** to rate hikes on financing |
| Healthcare (BDMS, BH) | Defensive | Low macro sensitivity — outperforms in risk-off |

General rate rule of thumb: **rate hikes** help banks, hurt property / utilities
/ rate-sensitive growth; **rate cuts** do the reverse.

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
| `sentiment` direction | Agent 1 narrative | **Yes** — verify against news |
| `reasoning` grounding (numbers, price moves, named precedents) | Agent 1 narrative | **Yes** — flag invented facts / dated reference cases |
| `affected_tickers`, `affected_sectors` | Agent 1 mapping → `matching.js` | **No** — expected expansion, judged by the deterministic matcher, not the fact checker |

Rule of thumb: the fact check verifies the **story** (is the dislocation real,
is the direction right, are the facts invented?), not the **tagging** (which
tickers/sectors) — the tagging is deterministic downstream and needs no LLM sign-off.
