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
