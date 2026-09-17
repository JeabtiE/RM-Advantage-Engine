---
name: client-prioritization
description: How affected clients are ranked after a dislocation is detected — the automated priorityScore formula (portfolio impact + Key Account threshold) plus manual factors the CIO/RM weighs during Four Eyes review.
---

# Client Prioritization

When a dislocation is flagged, an RM handling ~300 clients cannot call everyone
(KKP workshop, July 11). This skill defines how the affected-client list is ranked.

## The formula (automated)

```
priorityScore = impactShare + (aum >= KEY_ACCOUNT_AUM_THRESHOLD ? KEY_ACCOUNT_BOOST : 0)

KEY_ACCOUNT_AUM_THRESHOLD = 10_000_000   // THB
KEY_ACCOUNT_BOOST         = 0.15
```

Computed deterministically in `calculatePriority()`
([matching.js](../../src/utils/matching.js)) — **not** by AI.

### Units — read this before touching the constant

`impactShare` is a **fraction in [0, 1]**, not a 0–100 percentage. Holding
weights within a client sum to `1.0` (see [mockClients.js](../../src/data/mockClients.js)),
and `calculatePriority()` sums the matched holdings' weights directly.

So `KEY_ACCOUNT_BOOST = 0.15` is worth **15 percentage points of portfolio
impact** — a Key Account with 20% of its portfolio hit ranks alongside a
non-Key-Account client with 35% hit.

If `impactShare` is ever rescaled to 0–100, `KEY_ACCOUNT_BOOST` **must** be
rescaled to `15` in the same commit. Leaving it at `0.15` against a 0–100 scale
would not throw — it would silently reduce the boost to a rounding error, and
the Key Account tier would quietly stop working with nothing in the UI to say so.

### Term 1 — portfolio impact (the dominant driver)

**% of the client's portfolio affected by the dislocation.** A client with 35%
of their portfolio in an affected ticker ranks above one with 5%. This term is
unbounded by the boost: a non-Key-Account client at 60% impact still outranks a
Key Account at 20%. Exposure leads; the tier adjusts.

### Term 2 — the Key Account boost (a threshold, not a curve)

A client whose **total AUM ≥ 10,000,000 THB** gets a flat `+0.15`. Below the
bar: nothing.

**Rationale (KKP mentor).** This mirrors the mentor's explanation of "Key
Account" as a **threshold concept, not a continuous weighted average**. A client
above the AUM bar gets treated as high-priority regardless of exact wealth
beyond that point — a 45M client and an 11M client are both simply "Key
Accounts" and receive the same boost. This matches how RMs actually think about
client tiers in practice: they reason in tiers, not in a smooth function of
wealth.

This is why the formula is deliberately **not** `impactShare + (aum / someScale)`
or any AUM-weighted average. A continuous term would rank the 45M client above
the 11M client on wealth alone, which is not how the book is actually worked.

**The known cliff.** A threshold means 9,999,999 and 10,000,001 are treated
differently on a rounding error. This is accepted, not overlooked — it is
inherent to how the tier is defined in practice, and the boost is a ranking
nudge, not a gate: a near-miss client with real exposure still surfaces on the
list. The ranked list is a starting point the CIO/RM overrides by hand (below).

### Which holdings count — scope gate and direction

`impactShare` sums the weights of the client's **matched** holdings from
`findAffectedClients()`:

- `event_scope: "single_company"` → only holdings whose **ticker** is in
  `affected_tickers` match; the rest of that sector does not. Any other (or
  missing) scope → ticker **or** sector match, as originally.
- Each matched holding carries `matchedBy` (`ticker` wins if both) and
  `direction` — the sector's `sector_impacts` direction, else the top-level
  `sentiment`, else `neutral`.

**The score is GROSS exposure — directions are never netted.** A client long
banks (▲) and property (▼) on a rate hike adds both weights. Offsetting
exposures may roughly cancel in P&L, but the mix inside the portfolio shifted,
and that is exactly what the RM should explain — so the client still ranks by
total exposure. Direction is shown to the CIO (▲/▼ per ticker) and passed to
Agent 3; it does not change the ranking.

**Neutral sectors do not select clients.** Server-side normalization removes any
sector Agent 1 explicitly tagged `neutral` from `affected_sectors` before
matching (fixing a live case where a Fed-hike fixture put a client at 100% on
neutral-only holdings). A holding in a neutral sector still counts if it matched
by **ticker** (the company was named). Sectors with no explicit direction keep
matching and inherit the top-level sentiment.

**Ranking is not stable run to run.** Because a sector moving between
`positive`/`negative` and `neutral` changes which holdings count, the same news
can re-rank clients between live runs even at `temperature: 0`. Documented case:
N006 tariff/gold — healthcare `positive` in one run, `neutral` in the next, so
BDMS/BH/BCH weight dropped out and C008, C010, C001 and C004 moved down (same 10
clients). This is accepted. When the demo cache is regenerated, the regen script
prints a before/after ranking diff for human review; an unchanged ranking is not
required — Agent 2 `is_valid: true` on every cached item is.

## Secondary factors (manual — CIO/RM judgment)

The ranked list is a starting point, not the final call order. During Four Eyes
review, the CIO/RM should weigh these manually before deciding who to call first:

- **Days since last contact** — a client not spoken to in weeks may take priority over one called yesterday.
- **Prior interest in the asset class** — a client who has asked about this sector/asset before is a warmer, more relevant call.
- **Near-miss AUM** — a client just under the Key Account bar may still deserve Key Account treatment; the CIO sees the AUM and can override the ordering.

## Scope note

These secondary factors are **not computed automatically in this MVP**. They are
documented here so the CIO/RM can apply them by hand during the Four Eyes review,
and as a **roadmap item** for future automated weighting.

AUM was previously listed here as a manual factor. It is now automated as the
Key Account term above — the *threshold* is automated; judgment about clients
near the bar stays with the human.
