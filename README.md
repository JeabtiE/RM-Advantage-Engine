# RM Advantage Engine

**A News-to-Action Intelligence Platform for Relationship Managers in Thai wealth management.**

> "เราไม่ได้สร้างเครื่องมืออ่านข่าวให้ RM เราสร้างเครื่องมือที่ทำให้ RM มีอะไรที่ลูกค้าอ่านเองไม่ได้"
> *(We didn't build a tool that reads news for RMs we built a tool that gives RMs something clients can't read for themselves.)*

Built for the **AI × Finance Hackathon by CFA Society Thailand** (2026). 🏆 **1st Place / WINNER!!!.**

**🔗 Live demo:** [cfa-hackathon-demo.vercel.app](https://cfa-hackathon-demo.vercel.app)
**📄 License:** [CC BY-NC 4.0](./LICENSE)

---

## The Problem

A Relationship Manager at a Thai wealth management firm handles roughly 300 clients. Half of that time goes to client calls, a third to preparation, the rest to operations. An RM who calls a client just to relay news everyone already saw isn't adding value — the client can read the news themselves. An RM who calls with an insight the market hasn't priced in yet, is.

This system is built to turn the former into the latter.

## What It Does

Given a news event and how the market actually reacted to it, the pipeline finds the gap between what *should* have happened and what *did* happen — a **dislocation** — and turns that gap into a prioritized, compliance-reviewed call list with ready-to-use scripts for each affected client.

### Pipeline (5 stages)

```
News + Market Outcome
        ↓
[Agent 1] Impact + Dislocation Analyzer
   → What SHOULD this news affect (theory) vs. what DID the market do
   → Flags a dislocation when the two disagree (= an overlooked opportunity)
        ↓
Matching + Priority Scoring (deterministic JS — no AI)
   → Matches tickers/sectors to each client's actual holdings
   → Ranks clients by % of portfolio affected
        ↓
[Agent 2] Fact Checker
   → Verifies Agent 1's output against the original news, flags hallucinations
        ↓
Four Eyes Approval Gate (human-in-the-loop)
   → A CIO/Investment-expert persona reviews reasoning + priority list + fact-check
   → Can edit, approve, or reject — nothing reaches an RM or client without sign-off
        ↓
[Agent 3] Script Generator (per client, batched)
   → Converts the approved insight into a short, client-specific call script
   → Tone adapts to risk profile; always informational, never a directive to buy/sell
```

The **Four Eyes principle** (a real compliance term used in Thai wealth management, not just "human-in-the-loop") is the load-bearing safety mechanism here: it's the reason nothing an LLM writes can reach a client without a licensed person signing off first — which also sidesteps Thai SEC rules around who is legally allowed to give investment advice.

### Demo scenario

The "money shot" is a real case a CFA-charterholder judge described during a workshop: a tariff announcement where gold fell instead of rising, despite being the textbook safe-haven asset in a risk-off move. Agent 1 catches that dislocation, the pipeline ranks the ~80 of 300 clients actually affected, surfaces the top 12, and generates a different tone of script for a conservative client vs. an aggressive one — from the exact same underlying insight.

## Tech Stack

- **Frontend:** React 19 + Vite + Tailwind CSS 4
- **AI:** Claude API (3 sequential/parallel agent calls per news item — impact analysis, fact-checking, script generation)
- **Data:** Mock JSON for the guaranteed demo path (10 Thai clients with realistic SET holdings, pre-tested news items); an optional live mode pulls real headlines via a Vercel serverless function proxying Yahoo Finance RSS
- **Deploy:** Vercel

## Project Structure

```
api/
  fetch-live-news.js      Vercel serverless function — Yahoo Finance RSS proxy (CORS + .BK suffix handling)
src/
  components/
    NewsFeed.jsx          News selection (preset vs. live) + triggers the analysis pipeline
    ApprovalDashboard.jsx Four Eyes review UI (CIO persona)
    ClientList.jsx        Affected clients ranked by priority
    ScriptViewer.jsx       Per-client call scripts with copy-to-clipboard
  data/
    mockClients.js        10 Thai clients with realistic SET holdings
    mockNews.js            Pre-tested news items, including the tariff/gold dislocation case
    cachedDemoRun.js        Frozen pipeline output so the live demo never depends on a live API call
  utils/
    claudeAPI.js           Agent calls + retry/backoff logic
    matching.js             findAffectedClients() + calculatePriority() — deterministic, no AI
    liveNews.js             Adapts live RSS items into the pipeline's news shape
    parseAI.js               Strips markdown fences and validates agent JSON output
  hooks/
    useDraft.js             State machine for a draft's lifecycle (idle → analyzing → pending → approved/rejected)
```

## Getting Started

```bash
git clone https://github.com/JeabtiE/cfa-hackathon-demo.git
cd cfa-hackathon-demo
npm install
cp .env.example .env   # add your Claude API key
npm run dev
```

Other scripts:
- `npm run build` — production build
- `npm run regen:cache` — regenerate the frozen demo pipeline output in `cachedDemoRun.js`
- `npm run check:tickers` — verify tracked tickers still resolve correctly on data providers

## Known Limitations

Documented honestly here because the hackathon's own feasibility rubric rewards it, and because they're the kind of thing worth being upfront about in an interview:

- **Sector-expansion over-matching on single-company news.** Agent 1 is tuned to expand a systemic event (e.g. a tariff shock) across every sector it plausibly touches, which is the behavior that makes the demo's headline scenario work. On narrow, single-company news the same expansion over-includes clients who don't actually hold the named stock. The demo intentionally stays on audited scenarios where this doesn't surface; live mode carries an explicit on-screen caveat instead of a silent fix.
- **Live mode can't detect dislocations.** Real-time news feeds don't carry a matching price-outcome feed, and dislocation detection is fundamentally a comparison between expected and actual market reaction. Live mode proves the pipeline can ingest real news — it isn't a second dislocation demo.
- **Live news content is a lede, not a full article**, and coverage of Thai tickers via this feed is thin.
- **Thai ticker symbols require a `.BK` suffix** — a bare symbol resolves silently to an unrelated company on a different exchange, so this is enforced rather than left to fail quietly.

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
