// api/trackedTickers.js — canonical tracked-ticker list for the serverless
// functions, SELF-CONTAINED inside api/ on purpose.
//
// WHY THIS EXISTS (deploy-safety): api/fetch-live-news.js used to derive this
// list by importing getAllTickers() from ../src/data/mockClients.js. That made
// the serverless function bundle reach OUTSIDE api/ and pull in a frontend data
// module — plus, via Vercel's file trace, anything that module imports. A future
// change to mockClients.js (a new import, a browser-only dep, a rename) could
// then silently bloat or break the function bundle. Keeping the list here means
// the function depends on nothing outside api/ and can never break from a
// frontend-side refactor.
//
// DRIFT GUARD: this list is the 25 unique tickers across the client book. It
// must stay in sync with getAllTickers() in src/data/mockClients.js. That is
// enforced by `npm run check:tickers` (scripts/check-tracked-tickers.mjs), which
// fails loudly if the two diverge — run it after any change to the client book
// (e.g. Phase 15). The check imports the book freely because it runs at dev time,
// never inside the serverless bundle.

// Unique tickers across the 10-client book, in first-appearance order (the exact
// output of getAllTickers()). Generated from the book, not hand-typed.
export const TRACKED_TICKERS = [
  "KBANK",
  "BBL",
  "ADVANC",
  "BDMS",
  "DELTA",
  "GULF",
  "KCE",
  "PTT",
  "SCB",
  "CPN",
  "AOT",
  "BH",
  "KTB",
  "INTUCH",
  "PTTEP",
  "EA",
  "AMATA",
  "TRUE",
  "BEM",
  "LH",
  "BTS",
  "BCH",
  "HANA",
  "AP",
  "SPALI",
];

export default TRACKED_TICKERS;
