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
  analysis: { /* normalized Agent 1 output, incl. event_scope / sector_impacts / normalization_notes when present;
                 for a CIO-reviewed cached item this is the REVIEWED analysis */ },
  aiAnalysis: { /* CIO-reviewed cached items only: the original, unedited Agent 1 output */ },
  cioReview: { reviewer, reviewedAt, changes: [{ path, before, after, rationale }] }, // CIO-reviewed cached items only
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
  "sector_impacts": [{ "sector": "banking", "direction": "positive|negative|neutral", "reason": "one short Thai sentence" }],
  "dislocation_detected": true,
  "dislocation_description": "ทองลง 2.3% ทั้งที่ควรขึ้นในภาวะ risk-off — อาจเป็นโอกาสสะสม (ความเชื่อมั่นปานกลาง)",
  "reasoning": "max 2 lines"
}
```
- **event_scope** — `single_company`: news about one named company; no sector
  expansion. `sector`: one industry; no second-order sectors. `systemic`: macro /
  market-wide (rates, tariffs, FX, risk-off); second-order expansion allowed and
  must be justified in `reasoning`.
- **sector_impacts** — one entry per affected sector. Sectors must be the held
  sectors from the holdings summary. Mixed directions are expected (a rate hike:
  banking positive, property negative). Each entry carries a `reason`: one short
  Thai sentence giving the mechanism, using only facts from the news /
  marketOutcome plus general economic mechanisms, and a mechanism that fits that
  sector per the shared sector table (below).
- **sentiment (precise definition)** — the EXPECTED (theoretical) net impact of
  the news on the listed held sectors, judged BEFORE any market reaction, and
  consistent with `sector_impacts` (mostly negative → negative, balanced →
  neutral). It never overrides a per-sector direction. The ACTUAL market reaction
  belongs only in `dislocation_detected` / `dislocation_description` — a market
  that moved the other way does not change `sentiment`; that gap is the
  dislocation.
- **Shared sector table** — `SECTOR_MECHANISM_TABLE` (api/claude-agent.js) is the
  single definition of each sector's macro driver and characteristics, injected
  verbatim into BOTH the Agent 1 and Agent 2 prompts so they cannot disagree
  (bond proxies = utilities/power and telecom only; transport and property are
  rate-sensitive for other reasons). skills/dislocation-analysis §4 carries the
  same text; a test fails if either prompt or the skill doc drifts.
- **Temperature** — all three agents are called at `temperature: 0`. For Agents
  1/2 this reduces, but does not eliminate, run-to-run classification flips (see
  Known Limitations → ranking variance).
- **Limits on `dislocation_description` / `reasoning`** — facts only from the news
  content and marketOutcome; mechanisms only from the shared sector table; never
  contradict explicit forward guidance in the source (e.g. a dot plot signalling
  another hike rules out "the rate cycle has peaked").
- **Two-tier action language (Agent 1 vs Agent 3)** — Agent 1's output is
  ANALYST-facing: a licensed CIO reads it at the Four Eyes gate, so it MAY name a
  mispricing, an overlooked opportunity or a possible accumulation opportunity
  ("อาจเป็นโอกาสสะสม") — that is what dislocation analysis is for, and the N006
  money shot depends on it. It may NOT address the client or issue an instruction
  (second-person advice or imperative: "ควรซื้อ", "แนะนำให้ขาย", "you should buy").
  Agent 3's script is CLIENT-facing and keeps the strict ban: no
  buy/sell/accumulate language at all (hard constraint #2 — Thai SEC investment
  advice). Approval of the insight never licenses advice. A blanket ban on Agent 1
  was tried in Phase 4.1 and reverted in 4.2: it would have failed N006, whose own
  source text names an accumulation opportunity.
- **Ticker discipline** — for `systemic` / `sector` events, `affected_tickers`
  holds only companies named in the news or with company-specific exposure stated
  in the reasoning; sector-wide exposure goes in `affected_sectors` /
  `sector_impacts`. Prompt guidance only — there is deliberately no server-side
  ticker cap (a cap would silently drop a legitimately named company).

**`normalizeAgent1Output(output, heldSectors, heldTickers)`** (pure, idempotent;
held sectors and tickers are read from the same holdings summary Agent 1 saw):
- Lowercases/trims every sector string; exact duplicates in `affected_sectors` collapse.
- Non-array `affected_tickers` / `affected_sectors` → `[]` (matching.js would throw).
- `sector_impacts`: non-array → removed; entries without a sector, or for a
  sector the book doesn't hold → dropped; invalid/missing direction →
  `"neutral"` (so it also stops driving matching, below); duplicate sector →
  first entry wins; only `sector`, `direction`, `reason` are kept.
- **reason:** trimmed and capped at `MAX_SECTOR_REASON_CHARS` (300, truncated
  with "…" and noted); a non-string reason is removed with a note. A
  **non-neutral entry with a missing/blank reason is KEPT** (dropping it would
  silently remove that sector's clients) and gets a note naming the sector.
- **Union:** every NON-neutral `sector_impacts` sector is added to
  `affected_sectors` (matching decides sector matches from `affected_sectors`
  only, so an omission would silently drop those clients). No entry is invented
  for a sector that lacks one (matching falls back to top-level `sentiment`).
- **Neutral removal (the one exception to "never remove from affected_sectors"):**
  after the union, any sector with an explicit `neutral` entry is removed from
  `affected_sectors` — neutral sectors do not select clients. The entry stays in
  `sector_impacts` for display; a note names the removed sectors. Sectors with no
  `sector_impacts` entry are untouched (cached runs unaffected), and a named
  ticker in a neutral sector still matches by ticker.
- Invalid `event_scope` → field removed (matching defaults to `systemic`).
- **`single_company` is never changed to another scope.** If `affected_tickers`
  is empty or none of its tickers is held, the scope stays (the client list will
  be empty) and a note explains that no client holds the named company.
- Every change is recorded in `normalization_notes` (Thai, shown to the CIO);
  notes for conditions that persist after normalization are added once, so a
  second pass adds nothing. Model-written `normalization_notes` are discarded
  before normalizing, and the notes are never sent to Agent 2.

### Agent 2 — Fact Checker
Input: original news + Agent 1 output (minus `normalization_notes`)
Output: `{ "is_valid": bool, "flagged_issues": [], "adjusted_reasoning": "" }`

Checks: (1) dislocation honesty, (2) sentiment — flagged ONLY if inconsistent
with the `sector_impacts` directions (never for diverging from the actual market
reaction when a dislocation is described — that divergence IS the dislocation),
(3) narrative grounding, (4) `event_scope` consistent with the news text, (5) for
each NON-neutral `sector_impacts` entry, a blocking issue if the `reason` is
missing, contradicts the source, introduces facts not in the source (figures,
events, company facts), or uses a mechanism that does not fit that sector
according to the shared sector table (example of a wrong label: calling
transport a "bond proxy"; telecom and utilities are valid bond proxies). Agent 2
judges mechanisms against the shared table, not its own taxonomy. A general,
sector-appropriate economic mechanism is acceptable and is not flagged. Never
flag WHICH sectors or tickers were listed — that stays out of scope (see the
dislocation-analysis skill §6).
- **Source-only verification:** judge claims only against the provided news
  content and marketOutcome; never flag a name, date, figure or event as wrong
  from background knowledge, which may be outdated.
- **Check 6 (blocking):** `dislocation_description` or `reasoning` that addresses
  the client or issues an instruction (second-person advice / imperative), or that
  contradicts explicit forward guidance stated in the source. Analyst-facing
  opportunity language is explicitly NOT flagged (see two-tier rule above).
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
- Each holding line also carries its sector's approved `reason` as a "sector
  mechanism" (looked up from `analysis.sector_impacts` by the holding's
  `sector`); the script uses it to explain the effect and adds no new facts.
  Holdings without direction/reason produce the same prompt text as before.
- **Length cap:** max 3 sentences AND at most `MAX_SCRIPT_CHARS` = 600 characters
  (stated in the prompt). Thai has no reliable sentence delimiter, so characters
  are the deterministic proxy; 600 = the longest accepted cached script (N006/C004,
  581; the 13 N006/N003 scripts average 476.5) rounded up to the nearest 50. The
  server never truncates: an over-long script is returned in full with
  `length_exceeded: true`, ScriptViewer shows a warning, and the regen script
  refuses to cache it.
- **Focus:** at most two holdings per script (one from each side when mixed).
- **Few-shot examples** live in `AGENT3_FEW_SHOT_EXAMPLES` (api/claude-agent.js),
  rendered verbatim into the prompt and mirrored in skills/rm-script-writing §6
  (test-enforced). They model the facts-vs-mechanisms rule: the reported figure
  (gold −2.3%) is stated plainly; the effect on the client's stock is hedged
  (มีแนวโน้ม / อาจ) because no per-stock move is reported; each is ≤ 600 chars.
- **Reported facts vs mechanisms:** figures/moves stated in the approved insight
  are said plainly; sector mechanisms are hedged ("มีแนวโน้ม", "อาจ"). A mechanism
  is never presented as something that already happened to a specific stock
  unless the approved insight reports that stock's move. (Agent 3 sees only the
  approved analysis, not the raw news/marketOutcome — the approved insight is its
  fact source.)
- Endpoint validation: `matchedHoldings[].direction` ∈ positive|negative|neutral,
  `matchedBy` ∈ ticker|sector and `sector` a bounded string when present;
  `analysis.sector_impacts[].reason` an optional string ≤ 300 chars (optional —
  cached runs lack all of these).

### Matching output (deterministic, matching.js)
`findAffectedClients()` returns each affected client with `matchedHoldings`
(each holding + `matchedBy: "ticker"|"sector"`, ticker wins if both, and
`direction`: the sector's `sector_impacts` direction, else top-level `sentiment`,
else `"neutral"`) and `priorityScore`.
- `event_scope: "single_company"` → match by ticker only; otherwise ticker OR sector.
- Missing/unknown scope → `systemic`. `sector_impacts` only sets direction; it
  never widens the match set. (Neutral sectors are already removed from
  `affected_sectors` by normalization, so they select no clients.)
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

### Neutral sector impacts — addressed by normalization (Phase 3.2)

Found live 2026-09-17 (FOMC fixture): sectors tagged `neutral` still matched, so
all 10 clients matched and C002 ranked at 100% on neutral-only holdings. Now
`normalizeAgent1Output` removes explicitly neutral sectors from
`affected_sectors` (matching.js unchanged), and the CIO view labels them
"เป็นกลาง — ไม่ใช้จับคู่ลูกค้า".

### Agent 1 can exceed max_tokens and return unparseable JSON (found 2026-09-19)

`callClaude` sends `max_tokens: 2048` for Agent 1. Since Phase 3.2 added a Thai
`reason` per sector, a systemic item touching all seven held sectors can run past
that ceiling: the response is cut mid-string, `parseAIResponse` throws, and the
endpoint returns `502 invalid_model_output`. Measured in the stability eval
(evals/results/): **N007 failed this way on 1 of 1 attempt** — 3,006 raw chars
ending mid-word — while N006 (5 runs, 2,466–2,610 chars) stayed just under. The
cached N007 entry was generated before the limit was hit, so the demo path is
unaffected; LIVE analysis of a seven-sector item is the exposure. Not fixed in
the eval phase (it measures, it does not change behaviour): raising Agent 1's
max_tokens, or capping the number of sector_impacts entries, is a separate
change with its own regen and review.

### Client ranking varies run to run (accepted)

Agent 1's per-sector direction is not fully stable even at `temperature: 0`.
Documented case — **N006 tariff/gold, healthcare**: tagged `positive` in the
Phase 3.1 live run and `neutral` in the Phase 3.2 run. Neutral sectors do not
drive matching, so in the second run BDMS/BH/BCH weight dropped out and four
clients moved down (C008 #4→#8, C010 #5→#9, C001 #6→#7, C004 #9→#10; same 10
clients, Agent 2 still `is_valid: true`). The committed cache is unaffected until
a regen; a regen may legitimately change the on-screen ranking (decision: accept
— see "Demo cache regeneration" below).

### Demo cache regeneration — acceptance criteria

`npm run regen:cache` (scripts/regenerateDemoCache.mjs) may only be committed when:
1. **Agent 2 returns `is_valid: true` for every cached item** — enforced by the
   script (along with the dislocation-verdict, script-count, generic-script,
   typo and **script-length** gates: any `length_exceeded` script fails the run).
2. **A human has reviewed the review block** the script prints per regenerated
   item before writing: dislocation verdict + description, sector directions and
   reasons, normalization notes, Agent 2 verdict, each script's character count,
   and the before/after ranking diff (`scripts/rankingDiff.mjs`; a new item shows
   its new ranking). A changed ranking is NOT a failure (see ranking variance
   above); if the output is unacceptable for the demo, discard the working-tree
   change instead of committing it.
A ranking identical to the previous cache is no longer required.

### CIO review of a cached scenario (human edit, no Agent 1/2 re-run)

When a cached analysis needs a human correction, it is recorded — not
regenerated — so the AI's original output stays on record.
- **Review file (human-authored, committed):** `src/data/cioReviews/<newsId>.json`
  = `{ newsId, reviewer, reviewedAt, changes: [{ path, before, after, rationale }] }`.
  Allowed paths ONLY: `reasoning`, `sentiment`, `dislocation_description`,
  `sector_impacts[<sector>].direction`, `sector_impacts[<sector>].reason`.
  `before` must equal the cached value exactly (else rejected as stale);
  direction/sentiment must be positive|negative|neutral; rationale is required.
  Logic: `src/utils/cioReview.js` (pure).
- **Drafts cannot be applied:** a reviewer starting with "DRAFT" or any change
  containing `TEAM DECISION NEEDED` blocks the apply step.
- **Apply:** `npm run regen:cache -- --apply-cio-review <newsId>` applies the
  file to the cached Agent 1 output, re-runs `normalizeAgent1Output` +
  `findAffectedClients`, prints the review block (each change with before/after/
  rationale) and ranking diff, and regenerates **Agent 3 only** — Agent 1 and
  Agent 2 are never called. Same gates as a normal regen (length cap, generic,
  typo, failure artifact). Scripts use the CIO's `reasoning` if it was changed,
  else Agent 2's `adjusted_reasoning`.
- **Cache shape after apply:** `analysis` and `agent2Result` unchanged (the
  AI's record; Agent 2's verdict refers to the ORIGINAL analysis), plus
  `cioReview`, `reviewedAnalysis` (what matching and Agent 3 used),
  recomputed `affectedClients` / `scripts`, and `scriptsGeneratedAt`.
- **Agent 2's verdict covers the ORIGINAL AI output only.** A CIO edit is
  deliberately NOT re-checked by a machine: the human gate is the authority, and
  re-running Agent 2 on a CIO's own wording would either rubber-stamp it or
  invite an LLM to overrule a licensed reviewer. The cache keeps
  `agent2Result` next to the untouched `analysis`, and the UI labels it as the
  original's verdict so nobody reads it as approval of the edit. The deterministic
  checks (allowed paths, stale `before`, normalization, script gates) still run.
- **UI:** useDraft uses `reviewedAnalysis` and passes `aiAnalysis` + `cioReview`;
  ApprovalDashboard shows a "แก้ไขโดย CIO" panel with each change's original AI
  text, edited text and rationale, marks the hero text as CIO-edited, and labels
  the Agent 2 verdict as the original's.
- **N007 status:** `src/data/cioReviews/N007.json` is a DRAFT (reviewer "DRAFT —
  pending team review") with (a) a proposed dislocation_description edit removing
  the "rate cycle near its peak" inference and the "accumulate oversold stocks"
  suggestion, and (b) an open `TEAM DECISION NEEDED` on technology's direction
  (discount-rate mechanism → negative vs weaker-baht export support → positive;
  DELTA reported +3.00%). Not applied; the cache still shows the unedited AI text.

How the script behaves:
- **Single item:** `npm run regen:cache -- --only N007` (repeatable; the bare-id
  form `-- N007` still works) regenerates only that item. Every other cached
  item's serialized JSON is left byte-for-byte unchanged; only the file header
  (timestamp, summary) is rewritten.
- **Fixed vs reviewed dislocation:** N006 (`true`) and N003 (`false`) have fixed
  expected verdicts (gated). N007 has none (`expectDislocation: null`) — its
  verdict is Agent 1's call on real market data, printed for human review.
- **Fail-fast:** if Agent 2 returns `is_valid: false`, Agent 3 is not called for
  that item (saves one paid call per matched client).
- **Failure artifacts:** on any failure the cache is not written; the run's Agent
  1 output, Agent 2 output, ranked clients and scripts generated so far go to
  `.regen-failed/<newsId>-<timestamp>.json` (gitignored) for review.
- **Exit:** the script aborts by throwing, not `process.exit()`, because on
  Windows exiting while fetch keep-alive sockets close trips a libuv assertion
  (exit 0xC0000409 instead of 1).

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
scripts/
  regenerateDemoCache.mjs — `npm run regen:cache [-- --only <newsId> | --apply-cio-review <newsId>]`: → cachedDemoRun.js
                            (gated, fail-fast; prints review block + ranking diff; failures → .regen-failed/)
  rankingDiff.mjs         — pure before/after ranking diff used by the regen script
src/
  components/
    NewsFeed.jsx          — news selection (preset | live source switcher) + trigger analysis
    ApprovalDashboard.jsx — Four Eyes review UI (CIO persona)
    ClientList.jsx        — affected clients ranked by priority
    ScriptViewer.jsx      — per-client scripts with copy button
  data/
    mockClients.js        — 10 Thai clients with realistic SET holdings
    mockNews.js           — pre-tested news items: N001–N004, N006 (Tariff/Gold dislocation), N007 (Sep 2026 Fed hike, real market data)
    cachedDemoRun.js      — frozen pipeline output for N006/N003/N007 (demo never calls the API)
    cioReviews/<id>.json  — human-authored CIO review files (N007.json = DRAFT, not applied)
  utils/
    cioReview.js          — validate/apply a CIO review (allowed paths, stale check, draft blocker)
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

### Second cached scenario — N007, September 2026 Fed hike

FOMC raised the federal funds target range 25bp to 3.75%-4.00% on Sep 16, 2026
(12-0; prior range 3.50%-3.75%; first hike since July 2023; dot plot signalled a
possible further hike in 2026; largely priced in). `marketOutcome` uses only the
team-supplied Sep 17 data (Krungthep Turakij market-close report): SET 1,583.34,
+20.61 pts (+1.32%), turnover 62,452.42 MB; held most-active stocks DELTA, PTTEP,
KTB, PTT, BBL; the Sep 17 MORNING market USD/THB rate (33.38-33.40, labelled as
such); and the reported analyst view (buy-back after stocks had priced in the Fed
path). Sector index changes and BOT reference rates were not available and are
omitted; the Sep 16 SET close (1,562.73) is derived, not sourced, so it is not
stated. The item deliberately does not say whether a dislocation exists.
Cached result (regen 2026-09-17): systemic, dislocation detected (theory says a
hike weighs on stocks; the SET rose instead), Agent 2 valid, 10 clients, scripts
422–502 chars.

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