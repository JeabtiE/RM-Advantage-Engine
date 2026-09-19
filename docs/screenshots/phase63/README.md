# Phase 6.3 — branding, typography, glass, news order

Six screenshots: 3 views × 2 widths (`1440`, `390`), plus `1024` for the same
three. Captured at DPR 2 against `npm run dev` with the dependency-free CDP
driver.

| File | View |
|---|---|
| `01-header-and-rail-*` | New header mark + wordmark; rail with Live above Demo |
| `02-approval-glass-*` | Segmented bar on glass over the approval content |
| `03-sticky-action-bar-*` | Sticky Reject/Approve bar on glass over the client list |

## Favicon mapping

Both supplied packages are **transparent-background** — measured, every corner
alpha 0 in all ten PNGs. The black mark is `rgb(19,18,18)`, the white is
`rgb(255,255,255)`. Neither is legible on both a light and a dark tab strip, so
both ship and `prefers-color-scheme` picks.

| Source | → public/ | Wired as |
|---|---|---|
| `favicon_io-black/favicon.ico` | `favicon.ico` | `<link rel="icon" sizes="any">` — media-less fallback |
| `favicon_io-black/favicon-32x32.png` | `favicon-32x32-light.png` | `<link rel="icon" 32x32 media="(prefers-color-scheme: light)">` |
| `favicon_io-black/favicon-16x16.png` | `favicon-16x16-light.png` | `<link rel="icon" 16x16 media="(prefers-color-scheme: light)">` |
| `favicon_io-white/favicon-32x32.png` | `favicon-32x32-dark.png` | `<link rel="icon" 32x32 media="(prefers-color-scheme: dark)">` |
| `favicon_io-white/favicon-16x16.png` | `favicon-16x16-dark.png` | `<link rel="icon" 16x16 media="(prefers-color-scheme: dark)">` |
| `favicon_io-white/apple-touch-icon.png` **+ #0b0b0d** | `apple-touch-icon.png` | `<link rel="apple-touch-icon" 180x180>` |
| `favicon_io-white/android-chrome-192x192.png` **+ #0b0b0d** | `android-chrome-192x192.png` | manifest |
| `favicon_io-white/android-chrome-512x512.png` **+ #0b0b0d** | `android-chrome-512x512.png` | manifest |
| `favicon_io-white/favicon-32x32.png` | `mark-white.png` | in-app header `<img>` |
| — (authored fresh) | `site.webmanifest` | `<link rel="manifest">` |

Rows marked **+ #0b0b0d** are the only new assets: the white mark composited
over the app background, because iOS and Android composite a transparent icon
on **their** background, which is often white. Both shipped manifests were
byte-identical, with empty `name` and `#ffffff` colours, so one was authored
instead of kept: `name`/`short_name` = "Bulletin", `theme_color` and
`background_color` = `#0b0b0d`.

## Typography

```
--font-sans: "IBM Plex Sans Thai", -apple-system, BlinkMacSystemFont,
             "SF Pro Text", system-ui, "Inter", ui-sans-serif, "Segoe UI", sans-serif;
```

SF is **referenced, never bundled**: those three entries name fonts already
installed on the user's Apple device. No SF file is shipped, self-hosted,
subset or downloaded — Apple's licence does not permit web distribution, and
referencing an installed system face is not distribution.

Metrics check at 1440 / 1024 / 390 — no horizontal overflow, no element
overflowing its box, the three segmented tabs on one row at every width, the
`BULLETIN` wordmark 71px and never truncated.

> **Caveat:** the capture machine is Windows, so `-apple-system` / `SF Pro Text`
> do not resolve there and **Inter is what these screenshots actually render**.
> The Apple/SF path could not be verified on this hardware.

## Contrast (WCAG 2.1)

The glass treatment added only **inset 1px edges** (`box-shadow`), and the fill
alpha is unchanged at 0.90, so no composited background moved. Worst case
behind floating glass is the lightest surface carrying ~35% coverage of
near-white text, blurred → glass composites to **#141416**.

| Usage | Ratio | Needs | |
|---|---:|---:|---|
| text on bg — prose, verdict | 18.06 | 4.5 | PASS |
| text on surface / raised | 16.89 / 15.24 | 4.5 | PASS |
| text-2 on surface — prose, sector reasons | 7.17 | 4.5 | PASS |
| text-3 on surface / raised / bg | 5.66 / 5.11 / 6.06 | 4.5 | PASS |
| text-2 on bg — LIVE / DEMO section labels | 7.67 | 4.5 | PASS |
| up / down / reported / alert on surface | 7.38 / 5.13 / 6.47 / 8.33 | 4.5 | PASS |
| **text on glass** — BULLETIN, Analyze, active segment | **16.90** | 4.5 | PASS |
| **text-2 on glass** — inactive segment label | **7.18** | 4.5 | PASS |
| **text-3 on glass** — NEWS heading, CIO | **5.67** | 4.5 | PASS |
| **down on glass** — Reject label | **5.13** | 4.5 | PASS |
| bg on text — Approve (primary) label | 18.06 | 4.5 | PASS |
| white mark on glass — header logo | 18.40 | 3.0 | PASS |
| text / text-3 / down **sitting on a 1px edge** | 15.11 / 5.07 / 4.59 | 4.5 | PASS |
| text-3 on solid fallback (no blur / reduced-transparency) | 6.06 | 4.5 | PASS |

**Nothing regressed.** The glass edge alpha was tuned from `0x1f` down to
`0x0c` during this pass: at `0x1f`, text sitting *directly on* the 1px strip
would have scored 4.00 (text-3) and 3.62 (Reject). Text never reaches those
strips — the tightest chrome padding is 10px — but resting on that geometry
would mean a future padding change silently breaks AA, so the alpha now clears
AA even in that impossible case.

One measured row is **not applicable** and is not claimed as a pass:
`control-border` on a 1px edge = 2.73. That token is used only by the generic
secondary button, which appears inside notices on `bg`/`surface` (3.26 / 3.05,
passing). The one secondary button on glass is **Reject**, which overrides to
`border-down` and scores 5.13 on glass / 4.59 on an edge.

Fallbacks: `@supports not (backdrop-filter)` and
`@media (prefers-reduced-transparency: reduce)` both drop to the solid `#0b0b0d`
surface, where every ratio is higher still.

## News order

Live above Demo, each under its own label. Two things the ordering had to
respect:

1. **First-load selection is a cached demo scenario** (N006, the tariff/gold
   dislocation), derived from the cache rather than hardcoded so it degrades to
   another cached item if N006 ever leaves.
2. **The live section states up front** that analysing a live item needs local
   live mode — before the click, not as an error after it.

The live feed returns ~43 headlines, which pushed Demo entirely below the fold,
so the Live section shows 5 with a `Show N more live` expander. The count is
always visible; nothing is hidden silently.
