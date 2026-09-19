# Agent 1 stability eval — latest run

- **Model:** `claude-sonnet-4-6`
- **Temperature:** 0
- **Runs per item (N):** 5 (N006, EVAL-CPN) / 3 (N007)
- **Date:** 2026-09-19T08:21:11.303Z (N006, EVAL-CPN) · 2026-09-19T08:45:07.628Z (N007)
- **Real Anthropic calls:** 12

> These numbers are a snapshot of the session(s) recorded above. They are not
> a guarantee of future behaviour, not a benchmark, and not a quality
> judgement: the model can answer differently on the next run even at
> temperature 0, and a different PROMPT VERSION can answer differently again.
> The stability score is the mean of the modal-agreement shares below — a
> rough indicator for spotting which item moved most, nothing more.

> ⚠️ N006 and EVAL-CPN: measured 2026-09-19T08:21:11.303Z, N=5, 9 calls, BEFORE the Agent 1 token fix.

> ⚠️ N007: measured 2026-09-19T08:45:07.628Z, N=3, 3 runner-counted calls, AFTER raising Agent 1 to 6144 tokens and adding the JSON-validity rule + one endpoint parse retry. An earlier N007 attempt at 2048 tokens failed outright (JSON cut mid-word).

> ⚠️ EVAL-CPN stopped after 2 of 5 runs on a transport failure the harness did not retry; the runner now retries transport failures once, like production.

> ⚠️ In the N007 run, 1 of 4 model responses was still invalid JSON (unescaped double quote). The endpoint's parse retry recovered it, so all 3 runs completed. The per-run `retries` field counts only the RUNNER's transport retries — an endpoint-side parse retry is invisible to it and shows as a gap between runner calls (3) and real API calls (4).

## N006 — ทรัมป์ประกาศขึ้นภาษีนำเข้าทั่วโลก ตลาดการเงินผันผวนหนัก

Runs: 5 · stability score: **100%** (rough indicator)

| Field | Modal value | Agreement | Distribution |
|---|---|---|---|
| event_scope | `systemic` | 100% | systemic: 5 |
| sentiment | `negative` | 100% | negative: 5 |
| dislocation_detected | `true` | 100% | detected in 5/5 |

| Sector | Listed in | Used for matching | positive / negative / neutral | Modal | Flipped |
|---|---|---|---|---|---|
| banking | 5/5 | 5/5 | 0 / 5 / 0 | negative (100%) | no |
| energy | 5/5 | 5/5 | 0 / 5 / 0 | negative (100%) | no |
| healthcare | 5/5 | 0/5 | 0 / 0 / 5 | neutral (100%) | no |
| property | 5/5 | 5/5 | 0 / 5 / 0 | negative (100%) | no |
| technology | 5/5 | 5/5 | 0 / 5 / 0 | negative (100%) | no |
| telecom | 5/5 | 5/5 | 0 / 5 / 0 | negative (100%) | no |
| transport | 5/5 | 5/5 | 0 / 5 / 0 | negative (100%) | no |

**affected_tickers:** mean 0.0 (min 0, max 0) · every run: — · some runs: —

**Matched clients:** mean 10.0 · identical client set in 100% of runs · 1 distinct set(s)

| Client | Matched in |
|---|---|
| C001 | 5/5 |
| C002 | 5/5 |
| C003 | 5/5 |
| C004 | 5/5 |
| C005 | 5/5 |
| C006 | 5/5 |
| C007 | 5/5 |
| C008 | 5/5 |
| C009 | 5/5 |
| C010 | 5/5 |

## EVAL-CPN — Central Pattana and Mitsubishi Estate announce $330m mixed-use project

**Incomplete:** Agent "impact" request failed (502): upstream_error

Metrics below cover the 2 completed run(s) only — treat them as indicative.

Runs: 2 · stability score: **100%** (rough indicator)

| Field | Modal value | Agreement | Distribution |
|---|---|---|---|
| event_scope | `single_company` | 100% | single_company: 2 |
| sentiment | `positive` | 100% | positive: 2 |
| dislocation_detected | `false` | 100% | detected in 0/2 |

| Sector | Listed in | Used for matching | positive / negative / neutral | Modal | Flipped |
|---|---|---|---|---|---|
| property | 2/2 | 2/2 | 2 / 0 / 0 | positive (100%) | no |

**affected_tickers:** mean 1.0 (min 1, max 1) · every run: CPN · some runs: —

**Matched clients:** mean 2.0 · identical client set in 100% of runs · 1 distinct set(s)

| Client | Matched in |
|---|---|
| C003 | 2/2 |
| C007 | 2/2 |

## N007 — Fed raises federal funds rate by 25 basis points to 3.75%-4.00%, first hike since July 2023

Runs: 3 · stability score: **100%** (rough indicator)

| Field | Modal value | Agreement | Distribution |
|---|---|---|---|
| event_scope | `systemic` | 100% | systemic: 3 |
| sentiment | `negative` | 100% | negative: 3 |
| dislocation_detected | `true` | 100% | detected in 3/3 |

| Sector | Listed in | Used for matching | positive / negative / neutral | Modal | Flipped |
|---|---|---|---|---|---|
| banking | 3/3 | 3/3 | 3 / 0 / 0 | positive (100%) | no |
| energy | 3/3 | 0/3 | 0 / 0 / 3 | neutral (100%) | no |
| healthcare | 3/3 | 0/3 | 0 / 0 / 3 | neutral (100%) | no |
| property | 3/3 | 3/3 | 0 / 3 / 0 | negative (100%) | no |
| technology | 3/3 | 3/3 | 3 / 0 / 0 | positive (100%) | no |
| telecom | 3/3 | 3/3 | 0 / 3 / 0 | negative (100%) | no |
| transport | 3/3 | 3/3 | 0 / 3 / 0 | negative (100%) | no |

**affected_tickers:** mean 4.0 (min 4, max 4) · every run: BBL, DELTA, KTB, PTTEP · some runs: —

**Matched clients:** mean 10.0 · identical client set in 100% of runs · 1 distinct set(s)

| Client | Matched in |
|---|---|
| C001 | 3/3 |
| C002 | 3/3 |
| C003 | 3/3 |
| C004 | 3/3 |
| C005 | 3/3 |
| C006 | 3/3 |
| C007 | 3/3 |
| C008 | 3/3 |
| C009 | 3/3 |
| C010 | 3/3 |

## Cross-session variance (prompt versions)

These metrics describe ONE session each. Comparing sessions is the only way to
see prompt-version drift, and there is some:

| Item | Field | 2026-09-17 (cached run) | 2026-09-19 (this eval) |
|---|---|---|---|
| N007 | technology direction | `negative` | `positive` (3/3, and 3/3 in an earlier 08:36 run) |
| N006 | healthcare direction | `neutral` (Phase 3.2 run) | `neutral` (5/5) |

Within each session agreement was total (3/3 or 5/5 on every field of every
item). Across sessions, N007's technology direction differs. Between the two
dates the Agent 1 and Agent 2 prompts changed (Phase 4.2 rescoped the
action-language rule; Phase 5b.1/5b.2 raised max_tokens and added a
JSON-validity rule). Model and temperature (0) were unchanged.

**The prompt changes are a plausible cause, not a proven one.** Two sessions
cannot separate prompt effects from ordinary cross-session drift; establishing
that would need the old prompt re-run today, which was not done. What the data
does support: a direction can differ between prompt versions even when it looks
perfectly stable within a session — and technology's direction is exactly the
open `TEAM DECISION NEEDED` in src/data/cioReviews/N007.json.
