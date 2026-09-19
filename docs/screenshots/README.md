# Phase 6 — visual redesign screenshots

`before/` and `after/` hold the same 18 views at two widths each (36 files per
folder), captured against `npm run dev` with the cached N006 and N007 scenarios.

| Prefix | View |
|---|---|
| `01-news-idle` | News tab, nothing selected |
| `02-<id>-selected` | News tab, item selected, analyze enabled |
| `03-<id>-analyzing` | Loading state |
| `04-<id>-results` | Post-analysis results panel |
| `05-<id>-approval` | Four Eyes gate, pending |
| `06-<id>-approved` | Four Eyes gate, after approve |
| `07-<id>-clients` | Full ranked client book |
| `08-<id>-scripts` | Agent 3 scripts |
| `09/10/11-*-empty` | Empty states for approval / clients / scripts |

Suffix `-desktop` = 1280px viewport, `-mobile` = 390px, both at DPR 2 and
captured full-page.

## How they were captured

A dependency-free Chrome DevTools Protocol driver (Node 24's built-in
`WebSocket` + `fetch`, headless Chrome). No Playwright/Puppeteer was added to
the project. The driver lives in the session scratchpad, not the repo — it is a
one-off verification tool, not something the build depends on.

## Contrast (WCAG 2.1)

Computed from the token values in `src/styles/tokens.css` against the three
surfaces. AA needs **4.5:1** for normal text and **3:1** for UI component
boundaries.

| Usage | Ratio | Needs | |
|---|---:|---:|---|
| `text` on bg — prose, names, script text | 18.06 | 4.5 | PASS |
| `text` on surface — row names | 16.89 | 4.5 | PASS |
| `text` on raised — script body block | 15.24 | 4.5 | PASS |
| `text-2` on bg — notice bodies | 7.67 | 4.5 | PASS |
| `text-2` on surface — body prose, sector reasons | 7.17 | 4.5 | PASS |
| `text-3` on bg — 12px captions | 6.06 | 4.5 | PASS |
| `text-3` on surface — captions, units, tickers | 5.66 | 4.5 | PASS |
| `up` on surface — fact-check pass, ▲ | 7.38 | 4.5 | PASS |
| `down` on surface — sentiment, ▼ | 5.13 | 4.5 | PASS |
| `flat` on surface — neutral – | 5.37 | 4.5 | PASS |
| `alert` on bg — dislocation eyebrow, Key Account | 8.90 | 4.5 | PASS |
| `reported` on surface — "ราคาจริง" marker | 6.47 | 4.5 | PASS |
| `bg` on `text` — primary button label | 18.06 | 4.5 | PASS |
| `control-border` on bg — button outline | 3.26 | 3.0 | PASS |
| `control-border` on surface — button outline | 3.05 | 3.0 | PASS |

**All text meets AA.** `text-3` was raised from `#7c7c85` to `#8e8e97` during
this phase because the original failed on `surface` (4.45) and `raised` (4.01).

Two values sit below 3:1 **by design**, and are not text:

- `hairline` (#2a2a30, 1.38 on bg) — row separators. WCAG 1.4.11 exempts purely
  decorative elements; the rows are also separated by spacing and alignment, so
  the hairline is reinforcement, not the sole boundary.
- `hairline-strong` (#3a3a42, 1.63 on surface) — the container outline on a
  plain `Tag` (sector names, tickers, scope). The tag's meaning is carried by
  its label, which is `text-2` at 7.17:1. Interactive controls do **not** use
  this token; they use `control-border`, which passes.

Colour is never the sole carrier of meaning: every direction renders an arrow
(▲ ▼ –) and a text label next to the colour, and the screen-reader label is
present via `sr-only`.
