# Phase 6.2 — system-authored strings translated

The last Thai strings rendering inside English chrome were written by our own
code, not by a model, so they were chrome all along:

- `normalization_notes` — `normalizeAgent1Output`, `api/claude-agent.js`
- `factcheck_normalization_notes` — `normalizeAgent2Output`, same file
- `relevance.reason` — `filterRelevantNews`, `src/utils/matching.js`

None of the three is ever model input. Verified in code: `factCheck`
destructures `normalization_notes` out before building its prompt (and
`tests/claude-agent.test.js:329` enforces that), `generateScript` interpolates
only named analysis fields, and `relevance` is display-only state that never
reaches `claudeAPI.js`.

## Files here

| File | What it is |
|---|---|
| `normalization-notes.md` | Every note string as the **real normalizers actually emit it**, produced by calling the exported functions against fixtures. No API calls, no network. |
| `n007-normalization-note-1440.png` | The approval view for N007, scrolled to the "Automatic normalization" block. |

## About the screenshot

It shows the one thing worth being precise about: the heading and every other
label are English, and the note beneath it is still **Thai**.

That is correct and expected. N007's note is *cached* — frozen by a run that
predates this phase — and `src/data/cachedDemoRun.js` was deliberately not
edited. It is the frozen record of a real pipeline run; hand-editing it for a
cosmetic gain would destroy that guarantee. The note becomes English on the next
`npm run regen:cache`, which is a paid run requiring human review.

**There is no zero-API way to show the new English wording in the running app**,
because the notes are produced server-side during a live agent call and the only
cached note predates the change. The English wording is instead pinned by two
full-string test assertions in `tests/agent1-normalization.test.js` and
reproduced in `normalization-notes.md`.

## Cached data

| Item | `analysis.normalization_notes` | `factcheck_normalization_notes` |
|---|---|---|
| N006 | absent (predates Phase 3.2) | `[]` |
| N003 | absent (predates Phase 3.2) | `[]` |
| N007 | **1 Thai note** (legacy) | `[]` |

Recorded in CLAUDE.md under "Cached N007 still carries a Thai normalization
note (Phase 6.2)".

## Not translated, on purpose

`SECTOR_KEYWORDS` and `MACRO_KEYWORDS` in `src/utils/matching.js` are Thai, and
stay Thai. They are **matching data** — the terms searched for inside Thai news
text — not copy. Translating them would change which items the relevance filter
screens out, which is matching logic.
