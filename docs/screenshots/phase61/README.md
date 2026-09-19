# Phase 6.1 — two-pane desktop layout, English UI, iOS 26 materials

18 screenshots: 6 views × 3 widths (`1440`, `1024`, `390`).

| Prefix | View |
|---|---|
| `01-news-empty` | News list, nothing selected |
| `02-analyzing` | Analysis in progress (staged) |
| `03-approval` | Four Eyes approval, pending |
| `04-clients` | Affected clients, ranked |
| `05-scripts` | Per-client scripts, after approval |
| `06-error` | Analysis failed (real `upstream_error`) |

Captured at DPR 2 against `npm run dev` via a dependency-free Chrome DevTools
Protocol driver (Node's built-in `WebSocket` + `fetch`). The shell is `h-dvh`
with no page scroll, so each frame is the viewport — which is the point of the
layout.

The error frame is **not staged**: a second dev server ran with an invalid
`ANTHROPIC_API_KEY` and an uncached news item (N001) was analyzed, so the
pipeline really called the endpoint and really failed. Auth fails before any
generation, so it cost no tokens.

## Contrast (WCAG 2.1)

Computed from `src/styles/tokens.css`. AA needs **4.5:1** for normal text and
**3:1** for UI component boundaries.

### Opaque surfaces

| Usage | Ratio | Needs | |
|---|---:|---:|---|
| `text` on bg — prose, names, verdict | 18.06 | 4.5 | PASS |
| `text` on surface — row names, headings | 16.89 | 4.5 | PASS |
| `text` on raised — script body, selected row | 15.24 | 4.5 | PASS |
| `text-2` on bg — notice bodies | 7.67 | 4.5 | PASS |
| `text-2` on surface — body prose, sector reasons | 7.17 | 4.5 | PASS |
| `text-3` on bg — captions | 6.06 | 4.5 | PASS |
| `text-3` on surface — captions, units, tickers | 5.66 | 4.5 | PASS |
| `text-3` on raised — source/date on selected row | 5.11 | 4.5 | PASS |
| `up` on surface — fact-check pass, ▲ | 7.38 | 4.5 | PASS |
| `down` on surface — sentiment, ▼ | 5.13 | 4.5 | PASS |
| `flat` on surface — neutral – | 5.37 | 4.5 | PASS |
| `reported` on surface — "Reported" marker | 6.47 | 4.5 | PASS |
| `alert` on bg — dislocation eyebrow, Key Account | 8.90 | 4.5 | PASS |
| `bg` on `text` — primary button label | 18.06 | 4.5 | PASS |
| `control-border` on bg / surface — button outline | 3.26 / 3.05 | 3.0 | PASS |

### Over translucent chrome (new in 6.1)

Floating chrome is `--color-chrome` over whatever scrolls beneath it. The
worst-case backdrop is `--color-raised` (the lightest surface) carrying ~35%
coverage of near-white body text, blurred — i.e. a paragraph of Thai prose
passing under the bar. Composited, that is **#141417**.

| Usage | Ratio | Needs | |
|---|---:|---:|---|
| `text` on chrome — app title, Analyze label | 16.90 | 4.5 | PASS |
| `text-2` on chrome — inactive segment label | 7.18 | 4.5 | PASS |
| `text-3` on chrome — "NEWS" heading, "CIO" | 5.67 | 4.5 | PASS |
| `down` on chrome — **Reject** label | 5.13 | 4.5 | PASS |
| `control-border` on chrome — Reject outline | 3.05 | 3.0 | PASS |
| `text-3` on chrome, `@supports` fallback (opaque) | 6.06 | 4.5 | PASS |

**One regression was found and fixed.** The material started at alpha 0.72,
which left the red **Reject** label at 4.26:1 against the worst case — under AA,
on the one control where a misread is least acceptable. The alpha is now 0.90
(`e6`), which brings Reject to 5.13:1 and every other colour on chrome with it.
That number is load-bearing: lowering it re-breaks Reject first, which is why
`tokens.css` says so at the declaration.

### Deliberately below 3:1 — not text, not claimed as passes

- `hairline` (1.38 on bg) — row separators. WCAG 1.4.11 exempts decorative
  elements, and rows are also separated by spacing and alignment.
- `hairline-strong` (1.63 on surface) — the container outline on a plain `Tag`.
  The tag's meaning is carried by its label at 7.17:1. Interactive controls use
  `control-border`, which passes.

Colour is never the sole carrier of meaning: directions render an arrow
(▲ ▼ –) plus a text label, news-item status uses four distinct **shapes**
(ring / clock / check / slash), and every icon-only control has an `aria-label`
and a tooltip.
