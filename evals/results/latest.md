# Agent 1 stability eval — latest run

- **Model:** `claude-sonnet-4-6`
- **Temperature:** 0
- **Runs per item (N):** 5
- **Date:** 2026-09-19T08:21:11.303Z
- **Real Anthropic calls:** 9

> These numbers are a snapshot of ONE session. They are not a guarantee of
> future behaviour, not a benchmark, and not a quality judgement: the model
> can answer differently on the next run even at temperature 0. The
> stability score is the mean of the modal-agreement shares below — a rough
> indicator for spotting which item moved most, nothing more.

> ⚠️ N007: run 1 failed — Agent "impact" request failed (502): invalid_model_output

> ⚠️ EVAL-CPN: run 3 failed — Agent "impact" request failed (502): upstream_error

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

## N007 — Fed raises federal funds rate by 25 basis points to 3.75%-4.00%, first hike since July 2023

**Incomplete:** Agent "impact" request failed (502): invalid_model_output

No run completed, so there is nothing to measure.

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
