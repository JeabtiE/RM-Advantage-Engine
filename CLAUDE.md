# CLAUDE.md — Client Portfolio Intelligence (RM Advantage Engine)

## Project Context

**Competition:** AI × Finance Hackathon by CFA Society Thailand
**Deliverable:** PDF slide deck (max 10 pages) due July 19, 2026 + working demo for finals (Aug 2)
**Team role of this developer:** AI/Tech Lead (Computer Engineering Year 2, solo tech member)

## What This Product Is

A News-to-Action Intelligence Platform for Relationship Managers (RMs) in Thai wealth management.

**Core value proposition:** RMs who call clients just to relay news have no value — clients can read news themselves. RMs who call with insight the market hasn't noticed yet are worth paying for. This system turns the former into the latter.

**One-line pitch:** "เราไม่ได้สร้างเครื่องมืออ่านข่าวให้ RM — เราสร้างเครื่องมือที่ทำให้ RM มีอะไรที่ลูกค้าอ่านเองไม่ได้"

## Target User (SINGLE target — do not expand)

**Primary user:** RM / Wealth Manager at Thai financial institutions
**Approver persona:** CIO / Investment expert (uses the approval dashboard)

Evidence backing this choice (from CFA Charterholder workshop, July 11):
- KKP: "1 RM handles ~300 clients — too many. 50% time on client calls, 30% on preparation, 20% on operations"
- Fund Manager: "AI + human, not AI 100%. We still don't let AI trade on its own"
- K Asset: Tactical calls are reviewed in Investment Committee before distribution

## Core Workflow (5 stages)

```
[1] Input: News + Market Outcome (both embedded in mock data)
        ↓
[2] Agent 1 — Impact + Dislocation Analyzer (LLM call #1)
    - What SHOULD this news affect (theory)
    - What DID the market actually do (from marketOutcome field)
    - If they differ → flag DISLOCATION (= opportunity others missed)
        ↓
[3] Matching + Priority Scoring (deterministic JS — NO AI)
    - findAffectedClients(): match tickers/sectors to client holdings
      (single_company → ticker only; each match tagged matchedBy + direction)
    - calculatePriority(): rank by % of portfolio affected (gross — never netted)
    - Output: "Of 300 clients, 80 affected — call these 12 first"
        ↓
[4] Agent 2 — Fact Checker (LLM call #2)
    - Verify Agent 1 output against original news
    - Flag hallucinations before human review
        ↓
[5] Four Eyes Approval Gate (human-in-the-loop)
    - CIO sees: dislocation reasoning + priority list + fact-check result
    - Can edit, approve, or reject
    - NOTHING reaches RM/clients without approval
        ↓
[6] Agent 3 — Script Generator (LLM call #3, batch per client)
    - Converts approved insight into client-specific scripts
    - Tone adapts to client risk profile
    - Promise.allSettled for batch (partial failure safe)
        ↓
[7] RM calls highest-priority clients with real insight
```

## Key Terminology (use industry terms, not AI jargon)

| Use this | Not this | Why |
|---|---|---|
| "Four Eyes principle" | "Human-in-the-loop" | Industry term used by KKP compliance |
| "Dislocation" | "Anomaly detection" | Term used by K Asset strategists |
| "Tactical call" | "Recommendation" | Buy-side terminology |
| "ให้ข้อมูลประกอบการตัดสินใจ" | "คำแนะนำการลงทุน" | Legal: investment advice requires IC/IP license |

## Tech Stack

- **Frontend:** Vite + React + Tailwind CSS
- **AI:** Claude API (claude-sonnet-4-6) — 3 agent calls per news item
- **Local dev alternative:** Gemini API free tier (known 429 rate limit issues — retry logic required)
- **Data:** Mock JSON only (no real DB, no real news API)
- **Deploy:** Vercel

## Design Language (extracted from teammate's deployed dashboard — match this style)

The team already has a deployed personal finance dashboard. New frontend must feel like the same design system:

- **Page background:** White/very light gray (#f8fafc)
- **Hero card:** Dark navy (near-black, ~#0f172a) with white bold numbers — use for the most important metric (e.g., affected client count, dislocation alert)
- **Sub-cards inside hero:** Slightly lighter dark gray, rounded corners, small labels
- **Regular cards:** White, rounded-xl/2xl, subtle shadow, light gray border
- **Tabs:** Pill-style, light gray track, active tab = white raised pill, icon before label
- **Primary buttons:** Dark/black, white text, rounded, positioned top-right of sections
- **Financial colors:** Green for positive/+%, red for negative
- **Empty states:** Centered gray text with a second line of guidance
- **Header:** Small colored logo icon + app name (Thai) left, user info right
- **Language:** Thai primary, English terms in parentheses — e.g., "หุ้นอเมริกา (Webull)"

## Data Structures

### Client
```javascript
{
  clientId: "C001",
  name: "คุณสมชาย วงศ์สุวรรณ",
  riskProfile: "conservative" | "moderate" | "aggressive",
  holdings: [
    { ticker: "KBANK", name: "ธนาคารกสิกรไทย", sector: "banking", weight: 0.35 }
  ]
}
```

### News item (note the marketOutcome field — enables dislocation detection)
```javascript
{
  id: "N006",
  headline: "ทรัมป์ประกาศขึ้นภาษีนำเข้าทั่วโลก",
  content: "...(full news text)...",
  source: "Reuters",
  publishedAt: "2026-07-07T09:00:00Z",
  marketOutcome: "ตลาดหุ้นทั่วโลกปรับตัวลงตามคาด แต่ที่ผิดปกติคือทองคำก็ปรับตัวลง 2.3% และพันธบัตรสหรัฐถูกขายออกเช่นกัน ทั้งที่ปกติสินทรัพย์ปลอดภัยควรปรับตัวขึ้นในภาวะ risk-off"
}
```

### Draft (state machine: idle → analyzing → pending → approved/rejected)
```javascript
{
  draftId: "D001",
  status: "pending",
  newsSource: { headline, content },
  affectedTickers: [], affectedSectors: [],
  sentiment: "positive" | "negative" | "neutral",
  reasoning: "",
  dislocation: { detected: true, description: "ทองลงทั้งที่ควรขึ้น..." } | { detected: false },
  agent2Result: { is_valid, flagged_issues, adjusted_reasoning, factcheck_normalization_notes },
  analysis: { /* normalized Agent 1 output, incl. event_scope / sector_impacts / normalization_notes when present */ },
  affectedClients: [ /* Client + matchedHoldings (with matchedBy, direction) + priorityScore */ ],
  reviewedBy: null, approvedAt: null
}
```

## Agent Prompt Patterns (all must return JSON only, no markdown fences)

All prompt text lives in `api/claude-agent.js` (the only Anthropic caller);
`src/utils/claudeAPI.js` is a thin transport. Both Agent 1 and Agent 2 output
pass through a deterministic server-side normalizer after parsing (below).

### Agent 1 — Impact + Dislocation Analyzer
Input: news content + marketOutcome + holdings summary (`TICKER (name, sector)` per line)
Output:
```json
{
  "affected_tickers": [],
  "affected_sectors": [],
  "sentiment": "positive|negative|neutral",
  "event_scope": "systemic|sector|single_company",
  "sector_impacts": [{ "sector": "banking", "direction": "positive|negative|neutral" }],
  "dislocation_detected": true,
  "dislocation_description": "ทองลง 2.3% ทั้งที่ควรขึ้นในภาวะ risk-off — อาจเป็นโอกาสสะสม",
  "reasoning": "max 2 lines"
}
```
- **event_scope** — `single_company`: news about one named company; no sector
  expansion. `sector`: one industry; no second-order sectors. `systemic`: macro /
  market-wide (rates, tariffs, FX, risk-off); second-order expansion allowed and
  must be justified in `reasoning`.
- **sector_impacts** — one entry per affected sector. Sectors must be the held
  sectors from the holdings summary. Mixed directions are expected (a rate hike:
  banking positive, property negative); top-level `sentiment` is the net read and
  never overrides a per-sector direction.
- **Ticker discipline** — for `systemic` / `sector` events, `affected_tickers`
  holds only companies named in the news or with company-specific exposure stated
  in the reasoning; sector-wide exposure goes in `affected_sectors` /
  `sector_impacts`. Prompt guidance only — there is deliberately no server-side
  ticker cap (a cap would silently drop a legitimately named company).

**`normalizeAgent1Output(output, heldSectors)`** (pure, idempotent; held sectors
are read from the same holdings summary Agent 1 saw):
- Lowercases/trims every sector string; exact duplicates in `affected_sectors` collapse.
- Non-array `affected_tickers` / `affected_sectors` → `[]` (matching.js would throw).
- `sector_impacts`: non-array → removed; entries without a sector, or for a
  sector the book doesn't hold → dropped; unknown direction → `"neutral"`;
  duplicate sector → first entry wins; extra keys stripped.
- **Union:** every `sector_impacts` sector is added to `affected_sectors` (matching
  decides sector matches from `affected_sectors` only, so an omission would
  silently drop those clients). Sectors are never removed from `affected_sectors`,
  and no `sector_impacts` entry is invented for a sector that lacks one (matching
  falls back to top-level `sentiment`).
- Invalid `event_scope` → field removed (matching defaults to `systemic`).
- `event_scope: "single_company"` with an **empty** `affected_tickers` → changed to
  `"sector"` (it would otherwise match no client). Note: a non-empty list of
  tickers nobody holds is NOT downgraded.
- Every change is recorded in `normalization_notes` (Thai, shown to the CIO).
  Model-written `normalization_notes` are discarded before normalizing, and the
  notes are never sent to Agent 2.

### Agent 2 — Fact Checker
Input: original news + Agent 1 output (minus `normalization_notes`)
Output: `{ "is_valid": bool, "flagged_issues": [], "adjusted_reasoning": "" }`

Checks: (1) dislocation honesty, (2) sentiment direction, (3) narrative grounding,
(4) `event_scope` consistent with the news text, (5) each `sector_impacts`
direction supported by — or reasonably inferred from — the news/marketOutcome
(flag only a contradicted or baseless direction; never flag WHICH sectors or
tickers were listed — that stays out of scope, see the dislocation-analysis skill §6).
- **Source-only verification:** judge claims only against the provided news
  content and marketOutcome; never flag a name, date, figure or event as wrong
  from background knowledge, which may be outdated.
- `flagged_issues` lists only approval-blocking problems; observations the model
  concludes are acceptable are not listed.

**`normalizeAgent2Output(output)`** (pure, idempotent): `is_valid` is DERIVED —
true iff `flagged_issues` is empty. Missing issues → `[]`; blank/non-string issues
dropped; a bare string becomes a one-item list. Changes are recorded in
`factcheck_normalization_notes` (Thai, shown to the CIO only when present);
model-written notes of that name are discarded.

### Agent 3 — Script Generator (per client)
Input: approved analysis + client (name, riskProfile, matchedHoldings incl. `direction` when present)
Output: `{ "script": "Thai, max 3 sentences, informational tone, NEVER directive" }`
- conservative → cautious wording
- aggressive → direct wording
- ALWAYS informational framing, never "ควรซื้อ/ควรขาย"
- Each holding is described in its tagged direction; a client with both positive
  and negative holdings gets both sides mentioned briefly (still no rebalancing
  suggestion).
- Endpoint validation: `matchedHoldings[].direction` ∈ positive|negative|neutral
  and `matchedBy` ∈ ticker|sector when present (optional — cached runs lack them).

### Matching output (deterministic, matching.js)
`findAffectedClients()` returns each affected client with `matchedHoldings`
(each holding + `matchedBy: "ticker"|"sector"`, ticker wins if both, and
`direction`: the sector's `sector_impacts` direction, else top-level `sentiment`,
else `"neutral"`) and `priorityScore`.
- `event_scope: "single_company"` → match by ticker only; otherwise ticker OR sector.
- Missing/unknown scope → `systemic`. `sector_impacts` only sets direction; it
  never widens the match set.
- **priorityScore is GROSS exposure** (`calculatePriority`, unchanged): positive
  and negative holdings both add weight, never netted — a client with offsetting
  exposures still needs an RM conversation.

## Hard Constraints (never violate)

1. **AI output NEVER reaches clients without Four Eyes approval** — this is the legal safety mechanism
2. Scripts are informational only — no investment advice language (license issue with Thai SEC)
3. All API calls: try-catch + max 2 retries + 429-specific backoff (wait 10s)
4. `Promise.allSettled` (never `Promise.all`) for batch script generation
5. Demo NEVER depends on live APIs — all news pre-cached in mockNews.js
6. Matching logic is deterministic JS (filter/some) — never use AI for string matching
7. parseAIResponse() must strip ```json fences before JSON.parse (Claude adds them despite instructions)

## Known Limitations (state these honestly — Feasibility rubric rewards it)

### Sector expansion can over-include clients on single-company real news

**What:** Agent 1 is designed to expand a news event to every sector it touches
(a tariff shock legitimately reaches banking, property, healthcare via
second-order effects — this is the behavior that makes N006 work). On
single-company news, that same expansion is too broad: matching.js then sweeps in
every client holding *anything* in the sector, not just the named stock.

**Documented example (live mode, CPN, verified 2026-07-17):** the item "Central
Pattana and Mitsubishi Estate announce $330m mixed-use project" produced
`affected_sectors: ["property"]` → **6 of 10 clients matched, 4 of whom don't
hold CPN at all**. Agent 3 then wrote them scripts, and they are a stretch: the
AMATA script argues a Bangkok mall project drives industrial-estate demand; the
SPALI one pivots to "competitive atmosphere."

**Why it isn't visible on the demo path:** the mockNews items are written so
sector expansion lands cleanly (N003 correctly narrows to 3 of 10). Real
single-company news exposes it. This is PRE-EXISTING matching/Agent 1 behavior,
not a live-mode bug.

**Mitigation (hackathon, Phase 13):** the demo stayed on the audited N006/N003
cached scenarios, and live mode carries an up-front UI caveat (NewsFeed.jsx,
live-mode notice).

**Status now (post-hackathon Phases 2–3):** addressed in live mode. Agent 1
classifies `event_scope`, and matching.js matches `single_company` news by ticker
only. Verified live 2026-09-17: the same CPN item → `single_company`, **2 of 10
clients** (C007, C003 — both hold CPN). The cached N006/N003 runs predate these
fields and behave exactly as before. The NewsFeed caveat is still shown; the
README still lists the limitation.

### Neutral sector impacts still match (known, not yet addressed)

A sector listed with `direction: "neutral"` is still in `affected_sectors`, so
its holders match and their weight counts toward gross `priorityScore`. Live
2026-09-17, FOMC fixture: energy/technology/healthcare were tagged neutral, so all
10 clients matched and C002 ranked at 100% on neutral-only holdings. Not changed
yet — it is a matching/prioritization design decision (drop neutral-only matches,
or rank them lower).

### Live mode cannot detect dislocation (by construction)

Yahoo Finance RSS carries article text only — there is no companion price feed,
and dislocation detection IS the comparison of expected vs actual market move.
Live items therefore carry an explicit "no market data" sentinel as their
`marketOutcome` (src/utils/liveNews.js) and always yield
`dislocation_detected: false`. Verified: Agent 1 states the limitation in its
reasoning and Agent 2 returns `is_valid: true` rather than flagging it as a
hallucination. Live mode proves "the pipeline ingests real news" — it is
explicitly NOT a second dislocation demo case.

### Live news content is a lede, not a full article

The RSS `<description>` is the article's opening ~75–660 chars, truncated around
500. Fetching the linked article for full body text was tested and rejected:
links frequently leave Yahoo for third-party publishers behind consent walls.
Agent 1 analyzes a lede. Coverage is also thin and stale — of our 25 tracked
tickers, 7 have no Yahoo news at all and only 6 have anything from the last 90
days.

### Yahoo requires the .BK suffix, and fails silently without it

Thai listings need `.BK` (e.g. `PTT.BK`). A bare symbol does not error — it
resolves to a DIFFERENT company (`PTT` returns PTT Synergy Group Berhad, a
Malaysian firm). api/fetch-live-news.js applies the suffix unconditionally and
rejects any ticker outside the client book.

### Unverified until first deploy

api/fetch-live-news.js imports `../src/data/mockClients.js`. Vercel must trace
that into the serverless function bundle. It works via the Vite dev plugin
locally, but is UNTESTED on a real deploy — verify before finals.

## File Structure

```
api/
  claude-agent.js         — the ONLY Anthropic caller (all 3 agents). Server-only ANTHROPIC_API_KEY,
                            input allowlist/type/size validation, LIVE_AGENT_ENABLED kill switch
                            (anything but "true" → 503 live_mode_disabled). Errors are { error: code } only.
  fetch-live-news.js      — Vercel serverless Yahoo Finance RSS proxy (CORS + .BK suffix)
tests/                    — node:test suites (`npm test`); fetch is stubbed, never hits Anthropic
src/
  components/
    NewsFeed.jsx          — news selection (preset | live source switcher) + trigger analysis
    ApprovalDashboard.jsx — Four Eyes review UI (CIO persona)
    ClientList.jsx        — affected clients ranked by priority
    ScriptViewer.jsx      — per-client scripts with copy button
  data/
    mockClients.js        — 10 Thai clients with realistic SET holdings
    mockNews.js           — 5-6 pre-tested news items (include 1 dislocation case: Tariff/Gold)
    cachedDemoRun.js      — frozen pipeline output for N006/N003 (demo never calls the API)
  utils/
    claudeAPI.js          — thin transport: POSTs the 3 agent calls to /api/claude-agent (no prompts, no key)
    matching.js           — findAffectedClients() (scope gate, matchedBy/direction) + calculatePriority() + buildHoldingsSummary()
    liveNews.js           — adapts /api/fetch-live-news items → pipeline news shape (live mode only)
    parseAI.js            — safeParseJSON + validators
  hooks/
    useDraft.js           — full state machine for draft lifecycle
```

## Demo Scenario (the money shot)

Use the Trump Tariff case (told by K Asset judge herself at workshop):
1. Select tariff news → market outcome shows gold DOWN despite risk-off
2. Agent 1 flags dislocation: "gold should rise as safe haven but fell"
3. Priority list: 12 of 80 affected clients ranked by portfolio impact
4. CIO approves via Four Eyes dashboard
5. Script for conservative client vs aggressive client — same insight, different tone
6. Judges see: AI that reasons (not just tags), industry-standard approval flow, and their own case study working live

## Scoring Rubric Alignment (what slides/demo must prove)

| Criterion | Points | How we score high |
|---|---|---|
| Problem identification | 20 | Real quotes: "300 clients per RM" (KKP), industry numbers |
| AI Solution | 25 | Dislocation = real reasoning task requiring LLM, 3-agent architecture explained |
| Feasibility | 20 | Four Eyes exists in industry (3 judges confirmed), honest MVP limitations stated |
| Impact/Value | 20 | Measurable: reduce 30% prep time, prioritize 12 of 300 clients |
| Slide quality | 15 | Must be understandable without verbal explanation, max 10 pages, NO team/member/institution names |

## Response Preferences for Claude Code

- Comments explain "why" not "what"
- Flag anything that could break during live demo
- Simple > clever — demo reliability is everything
- When fixing bugs: root cause first, then fix
- Thai UI text, English code/comments

## Implementation Notes

### State-lifting plan (intentional sequencing — NOT a bug)

`useDraft()` currently lives INSIDE `NewsFeed.jsx` so that component could be
built and tested in isolation first. This is deliberate build order, not an
oversight.

**Planned move:** once `ApprovalDashboard.jsx` exists, `useDraft()` lifts up to
`App.jsx`, which owns the single draft instance and passes the relevant pieces
down to every view:

- `NewsFeed` — receives `analyzeNews` (+ `status`) instead of calling `useDraft()` itself.
- `ApprovalDashboard` — receives `draft`, `onApprove`, `onReject` (already built to these props).
- `ClientList` / `ScriptViewer` — receive `draft.affectedClients` and `scripts`.

Why one instance: the Four Eyes flow requires the SAME draft NewsFeed produced
to be the draft the CIO approves and the draft Agent 3 scripts. Two separate
`useDraft()` instances would desync the pipeline. Do the lift only after
ApprovalDashboard is reviewed in isolation (current step keeps them decoupled on
purpose).