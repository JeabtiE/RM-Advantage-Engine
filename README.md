# RM Advantage Engine

[![CI](https://github.com/JeabtiE/RM-Advantage-Engine/actions/workflows/ci.yml/badge.svg)](https://github.com/JeabtiE/RM-Advantage-Engine/actions/workflows/ci.yml)

**A News-to-Action Intelligence Platform for Relationship Managers in Thai wealth management.**

> "เราไม่ได้สร้างเครื่องมืออ่านข่าวให้ RM เราสร้างเครื่องมือที่ทำให้ RM มีอะไรที่ลูกค้าอ่านเองไม่ได้"
> *(We didn't build a tool that reads news for RMs we built a tool that gives RMs something clients can't read for themselves.)*

Built for the **AI × Finance Hackathon by CFA Society Thailand** (2026). 🏆 **1st Place / WINNER!!!.**

**🔗 Live demo:** [cfa-hackathon-demo.vercel.app](https://cfa-hackathon-demo.vercel.app)
**📄 License:** [CC BY-NC 4.0](./LICENSE)

---

## The Problem

A Relationship Manager at a Thai wealth management firm handles roughly 300 clients. About half their time goes to client calls, a third to preparation, the rest to operations. An RM who calls a client just to relay news everyone already saw isn't adding value — the client can read the news themselves. An RM who calls with an insight the market hasn't priced in yet, is.

This system is built to turn the former into the latter.

## What It Does

Given a news event **and how the market actually reacted to it**, the pipeline finds the gap between what *should* have happened and what *did* happen — a **dislocation** — and turns that gap into a prioritized, compliance-reviewed call list with a ready-to-use script per affected client.

```
News + Market Outcome
        ↓
[Agent 1] Impact + Dislocation Analyzer                          ← LLM
   → What SHOULD this news affect (theory) vs. what DID the market do
   → Classifies event scope (systemic / sector / single company)
   → Per-sector direction (positive / negative / neutral) with a reason
   → Flags a dislocation when theory and reality disagree
        ↓
Server-side normalization                                        ← deterministic
   → Makes the analysis internally consistent before anything consumes it
   → Every change is recorded and shown to the reviewer, never silent
        ↓
Matching + Priority Scoring                                      ← deterministic
   → Matches tickers/sectors against each client's actual holdings
   → Ranks by share of portfolio affected (+ a flat Key Account boost)
        ↓
[Agent 2] Fact Checker                                           ← LLM
   → Re-reads Agent 1 against the source only; flags unsupported claims
   → Its verdict is derived in code: valid ⟺ no issues flagged
        ↓
Four Eyes Approval Gate                                          ← human
   → A CIO reviews the reasoning, the fact check and the call list
   → Nothing reaches an RM or a client without sign-off
        ↓
CIO review layer (optional, committed as a file)                 ← human + deterministic
   → A reviewer can correct the analysis; the AI's original is kept verbatim
   → The edit re-runs matching and regenerates scripts — never Agent 1 or 2
        ↓
[Agent 3] Script Generator (per client, batched)                 ← LLM
   → Converts the approved insight into a short, client-specific call script
   → Tone adapts to risk profile; informational only, never buy/sell advice
```

The **Four Eyes principle** (a real compliance term in Thai wealth management, not a rebrand of "human-in-the-loop") is the load-bearing safety mechanism: nothing an LLM writes reaches a client without a licensed person signing off — which also keeps the system on the right side of Thai SEC rules about who may give investment advice.

## What's deterministic and what's AI

The LLM is used only where judgement is genuinely required. Everything that decides **who gets called** is plain JavaScript.

| Step | How | Why |
|---|---|---|
| Dislocation analysis, fact check, scripts | LLM (3 calls per news item) | Reasoning about what *should* have happened, and writing Thai prose |
| Normalizing the analysis | Code | Consistency rules must be exact and auditable |
| Matching clients to a news event | Code (`src/utils/matching.js`) | See below |
| Priority ranking | Code | A ranking formula must be explainable to a CIO line by line |
| Fact-check verdict | Code | `is_valid` is derived from the issue list, not trusted to the model |
| Script length limit | Code | 600 characters, checked server-side |

**Matching never uses an LLM.** String matching is a solved problem, and an LLM would make it unrepeatable: the same news could produce a different call list twice in a row, with no way to explain to a compliance officer why a client was or wasn't contacted. `findAffectedClients()` is `filter`/`some` over holdings, so the same analysis always yields the same clients, and the ranking can be recomputed by hand.

The demo book is deliberately small and fixed: **10 Thai clients, 25 SET tickers, 7 sectors** (`src/data/mockClients.js`). The "300 clients" above is the problem being modelled, not the size of this dataset.

## Demo scenarios

Two scenarios ship as frozen pipeline output, so the demo never depends on a live API call.

### 1. Tariff / gold dislocation (`N006`) — the headline case

A real case a CFA-charterholder judge described in a workshop: a global tariff announcement where **gold fell 2.3%** instead of rising, despite being the textbook safe haven in a risk-off move, and US treasuries sold off too. Agent 1 flags the divergence as the insight; the pipeline matches **10 of 10** clients in the demo book and writes a different tone of script for a conservative versus an aggressive client from the same underlying analysis. A second cached item (`N003`, AI-driven electronics exports) is the counterweight: it narrows to **3 of 10** clients, which is what makes "call these first, not everyone" visible on screen.

### 2. September 2026 Fed hike (`N007`) — real market data

The FOMC raised the federal funds target range 25bp to 3.75%–4.00% on 16 September 2026 (unanimous, 12-0; first hike since July 2023; the dot plot signalled a possible further hike in 2026; the move was largely priced in).

**Market figures that are real and sourced** (Krungthep Turakij market-close report, 17 September 2026):

- SET index close **1,583.34**, +20.61 points (**+1.32%**), turnover 62,452.42 MB
- Most-active stocks held in the demo book: DELTA 240.00 (+3.00%), PTTEP 151.00 (−1.63%), KTB 45.00 (+1.12%), PTT 42.25 (+0.60%), BBL 193.00 (+0.52%)
- USD/THB **33.38–33.40** — explicitly labelled a *morning market rate*, not a BOT reference rate

**Figures that were not available, and are therefore absent from the data:**

- Sector index changes (SETBANK, PROP, TRANS, ICT, ENERG, HELTH, ETRON)
- BOT reference USD/THB rates for 16 and 17 September
- The 16 September SET close is *derived* from the reported change (1,562.73) and so is not stated as a fact

The news item says only what moved; it does not say whether a dislocation exists — that is Agent 1's call. On the cached run it found one: theory says a hike weighs on equities, and the SET rose instead.

## Security model

- **The API key is server-only.** `ANTHROPIC_API_KEY` is read only by `api/claude-agent.js`. The browser never calls Anthropic, and the dev server refuses to start if `VITE_ANTHROPIC_API_KEY` is set, because Vite exposes every `VITE_*` variable to browser code.
- **The endpoint validates before spending anything.** POST only; exactly three agent names (`impact`, `factcheck`, `script`); per-agent required fields and types; size caps on the headline, the article body, every string interpolated into a prompt, and the whole request body (64 KB). Errors return `{ error: "<code>" }` — no stack traces, upstream bodies or prompt text.
- **Kill switch.** Unless `LIVE_AGENT_ENABLED` is exactly `true`, the endpoint returns `503 live_mode_disabled` before touching the Anthropic API. It is opt-in, so a fresh deploy is safe by default.
- **The public demo costs nothing to run.** With the kill switch off, the deployed site serves cached output and makes **zero API calls**; the UI shows a plain notice (not an error) if you pick an uncached item.
- **CI holds no secrets.** Every test stubs the model call, so the workflow needs no credentials.

## Prompt stability (measured, not assumed)

Agent 1 runs at **temperature 0**, which is not the same as deterministic. `npm run eval:stability` calls Agent 1 only, N times per news item, normalizes each result, runs the real matcher on it, and reports agreement. Full output: [`evals/results/latest.md`](./evals/results/latest.md).

From the 19 September 2026 session (`claude-sonnet-4-6`, temperature 0):

| Item | Runs | Agreement |
|---|---|---|
| N006 tariff/gold | 5 | event scope, sentiment, dislocation, every sector direction and the 10-client set: **5/5 identical** |
| N007 Fed hike | 3 | same fields: **3/3 identical** |
| Single-company fixture (CPN) | 2 | **2/2 identical**; matched only the 2 clients who hold CPN |

Within a session the analysis was stable. **Across prompt versions it was not:** N007's `technology` direction is `negative` in the cached run of 17 September and `positive` in all three runs of 19 September, same model and temperature, with prompt changes in between. That is a plausible cause, not a proven one — two sessions cannot separate a prompt effect from ordinary drift.

**Within-session stability does not imply stability across prompt versions.** A direction flip is not cosmetic: a sector marked `neutral` stops selecting clients altogether, so the call list changes. Re-measure after any prompt change, before regenerating the cache.

## What the eval caught that unit tests could not

The unit suite (147 tests, all stubbed) proves the code does what it says. It cannot observe what a real model actually returns. Two failures only showed up under real calls:

- **Token-limit truncation.** Agent 1 ran with `max_tokens: 2048`. Once Thai per-sector reasons were added, a seven-sector answer overran it: the JSON was cut mid-word and surfaced as a parse error, blaming the model for our own budget. Observed on N007 (3,006 characters, cut), while N006 fit in 2,466–2,610. Fixed by sizing budgets per agent (Agent 1 **6144**, Agent 2 **4096**, Agent 3 **1024**) and by checking `stop_reason` *before* parsing, so truncation now returns a distinct `response_truncated` error with its own UI message.
- **Malformed JSON from the model.** Roughly **1 in 5 live Agent 1 responses** contained an unescaped double quote inside a Thai string (`…เป็น "buy the fact" มากกว่า…`), which `JSON.parse` rejects. Both prompt guidance and one server-side retry now mitigate it; in the most recent run 1 of 4 raw responses was still malformed and the retry recovered it, so all 3 runs completed. **Small sample** — 4 and 5 observations respectively, not a rate you should bank on. The response is never repaired programmatically: a wrong repair produces plausible but incorrect analysis, which is worse than a visible error.

## Getting Started

Requires **Node.js 24 or newer** — the only version this project has been tested on (CI pins Node 24, and local development is on 24). Older versions may well work, but nothing here verifies that.

```bash
git clone https://github.com/JeabtiE/RM-Advantage-Engine.git
cd RM-Advantage-Engine
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY (server-only — never VITE_-prefixed)
npm run dev
```

The three cached scenarios (`N006` tariff/gold, `N003` AI exports, `N007` Fed hike) work with **no key and no API calls**.

**Live analysis** (any other news item, or the live Yahoo feed) needs two variables in `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
LIVE_AGENT_ENABLED=true
```

Set the kill switch locally to use live mode; the public deployment leaves it unset.

| Script | What it does |
|---|---|
| `npm test` | 147 tests: endpoint validation, matching, normalization, CIO review, eval metrics, regen behaviour, plus the relevance-filter checks. No key, no network. |
| `npm run build` | Production build |
| `npm run dev` | Vite dev server, which also mounts the `/api` functions locally |
| `npm run eval:stability -- --items N006,N007 --runs 5 --max-calls 10` | Prompt-stability eval. **Makes real API calls** — `--max-calls` is a required hard cap. Never part of `npm test`. |
| `npm run regen:cache -- --only N007` | Regenerate one cached scenario (omit `--only` for all). Gated: Agent 2 must pass, no over-long or generic scripts; prints a review block and a before/after ranking diff; failures are written to `.regen-failed/` and the cache is left untouched. |
| `npm run regen:cache -- --apply-cio-review N007` | Apply a committed CIO review file and regenerate **Agent 3 only** — Agent 1 and Agent 2 are never called. |
| `npm run check:tickers` | Verify tracked tickers still resolve on the data provider |

## Project Structure

```
.github/workflows/ci.yml   Tests + build on push and PR to main (Node 24, no secrets)
api/
  claude-agent.js          The ONLY place Claude is called (all 3 agents): holds the key,
                           validates input, per-agent token budgets, kill switch, parse retry
  fetch-live-news.js       Yahoo Finance RSS proxy (CORS + .BK suffix handling)
  trackedTickers.js        The 25 tickers the live feed is allowed to query
evals/
  stability.mjs            Prompt-stability runner (real API calls, hard call cap)
  metrics.mjs              Pure metric functions (unit-tested)
  fixtures/                Eval-only news items (e.g. a single-company case)
  results/                 Committed run output + latest.md summary
scripts/
  regenerateDemoCache.mjs  Rebuild cachedDemoRun.js from a live run (gated, reviewable)
  rankingDiff.mjs          Before/after client-ranking diff used by the regen script
src/
  components/
    NewsFeed.jsx           News selection (preset vs. live) + triggers the pipeline
    ApprovalDashboard.jsx  Four Eyes review UI (CIO persona), incl. the CIO-edit panel
    ClientList.jsx         Affected clients ranked by priority
    ScriptViewer.jsx       Per-client scripts with copy-to-clipboard
  data/
    mockClients.js         10 Thai clients with realistic SET holdings
    mockNews.js            Pre-tested news items (N001–N004, N006 tariff/gold, N007 Fed hike)
    cachedDemoRun.js       Frozen pipeline output for N006 / N003 / N007 (auto-generated)
    cioReviews/N007.json   Human-authored CIO review (currently a draft — see below)
  utils/
    matching.js            findAffectedClients() + calculatePriority() — deterministic, no AI
    claudeAPI.js           Thin transport to /api/claude-agent (no prompts, no key)
    cioReview.js           Validate/apply a CIO review (allowed paths, stale checks)
    liveNews.js            Adapts live RSS items into the pipeline's news shape
    parseAI.js             Strips markdown fences and validates agent JSON output
  hooks/
    useDraft.js            Draft state machine (idle → analyzing → pending → approved/rejected)
tests/                     9 node:test suites; the Anthropic call is stubbed everywhere
```

## Known Limitations

Documented honestly because they're the kind of thing worth being upfront about — and because measuring them is most of the work.

- **Sector over-matching on single-company news — fixed.** Agent 1 used to expand any event across every sector it plausibly touched, so a single-company story swept in clients who didn't hold the named stock (a CPN property deal matched 6 of 10 clients, 4 of whom held no CPN). Agent 1 now classifies event scope, and matching treats `single_company` news as ticker-only. Verified live: the same CPN item now matches **2 of 10** clients — exactly the two who hold CPN.
- **Cross-session variance.** Directions are stable within a session but have differed across prompt versions (N007 `technology`: negative on 17 Sep, positive 3/3 on 19 Sep). Re-measure after prompt changes; see [Prompt stability](#prompt-stability-measured-not-assumed).
- **Malformed model JSON, roughly 1 in 5 live Agent 1 calls** (small sample). One server-side retry recovers it; two malformed responses in a row still fail the run, visibly.
- **Cached scenarios were generated under different prompt versions.** `N006` carries **19 tickers** from an older prompt, while current runs return **0** for the same item (the prompt now restricts `affected_tickers` to companies actually named in the news). The cached output is internally consistent and the demo is unaffected, but it is not what today's prompt produces.
- **The `N007` CIO review is a draft, not applied.** `src/data/cioReviews/N007.json` proposes removing an unsupported "rate cycle has peaked" inference and an accumulation suggestion, and leaves an open `TEAM DECISION NEEDED` on the `technology` direction (higher discount rate → negative, versus a weaker baht helping exporters → positive, with DELTA reported +3.00%). The apply step refuses to run while either marker is present.
- **Live mode can't detect dislocations.** Real-time feeds carry no matching price-outcome data, and dislocation detection is precisely a comparison of expected versus actual reaction. Live items carry an explicit "no market data" sentinel and always return `dislocation_detected: false`. Live mode proves the pipeline ingests real news; it is not a second dislocation demo.
- **Live news content is a lede, not a full article**, and Thai coverage through this feed is thin: of the 25 tracked tickers, 7 had no Yahoo news at all and only 6 had anything from the previous 90 days when last checked.
- **Thai ticker symbols require a `.BK` suffix** — a bare symbol resolves silently to an unrelated company on another exchange (`PTT` returns a Malaysian firm), so the suffix is enforced rather than left to fail quietly.
- **The serverless deploy path is only partly exercised.** `api/fetch-live-news.js` imports from `src/data/`, which works through the Vite dev plugin locally; the bundling behaviour on a real Vercel deploy has not been re-verified.

## Team

| Member | Faculty | Role |
|---|---|---|
| [Kritteera Moonboon](https://www.linkedin.com/in/kritteera-moonboon-058aa43b3/) | Economics, Chiang Mai University | Market & Economic Research — sourced the news/market-outcome pairs and the dislocation logic behind them |
| [Wisarut Selaman](https://www.linkedin.com/in/wisarut-selaman-7ba35a257/) | Business Administration, Chiang Mai University | Business Strategy & Pitch — problem framing, value proposition, and slide narrative |
| [Ponlapat Meejan](https://www.linkedin.com/in/ponlapat-meejan-46aa83426/) | Business Administration (Accounting), Chiang Mai University | Compliance & Financial Reporting — Four Eyes / Thai SEC compliance framing, feasibility case |
| Nutnaree Zusuwan | Management Sciences (Finance), Prince of Songkla University | Portfolio & Investment Analysis — client holdings structure and risk-profile logic |
| [Nattapat Srirung](https://www.linkedin.com/in/nattapat-srirung-36a438361/) | Computer Engineering, Chiang Mai University | AI/Tech Lead — sole technical member; built the agent pipeline, matching logic, and frontend end-to-end |

Built for the AI × Finance Hackathon by CFA Society Thailand, 2026.

## License

This project is licensed under **[Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](./LICENSE)**.

In short, that means:
- ✅ Anyone can view, share, and adapt this work, including for building on the idea
- ✅ Attribution to the team is required
- ❌ **No commercial use** without the team's explicit permission
- The full legal terms are in [`LICENSE`](./LICENSE); a human-readable summary is at [creativecommons.org/licenses/by-nc/4.0](https://creativecommons.org/licenses/by-nc/4.0/)

Copyright © 2026 the RM Advantage Engine team (see [Team](#team) above).
