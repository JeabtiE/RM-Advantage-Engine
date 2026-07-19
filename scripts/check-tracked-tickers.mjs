// check-tracked-tickers.mjs — drift guard for api/trackedTickers.js.
//
// api/trackedTickers.js hard-codes the tracked-ticker list so the serverless
// function stays self-contained (no import reaching into src/). The cost of that
// decoupling is that the list could drift from the real client book. This check
// closes that gap: it asserts the api list equals getAllTickers() derived from
// src/data/mockClients.js, and exits non-zero (failing CI / a pre-deploy step)
// if they diverge.
//
// RUN IT after any change to the client book (Phase 15 edits mockClients.js):
//   npm run check:tickers
//
// This runs at DEV time and imports the book freely — it is never part of the
// serverless bundle, so it cannot reintroduce the coupling it guards against.

import { getAllTickers } from "../src/data/mockClients.js";
import { TRACKED_TICKERS } from "../api/trackedTickers.js";

const book = getAllTickers();

const bookSet = new Set(book);
const apiSet = new Set(TRACKED_TICKERS);

const missingFromApi = book.filter((t) => !apiSet.has(t)); // in book, not in api list
const extraInApi = TRACKED_TICKERS.filter((t) => !bookSet.has(t)); // in api list, not in book
// Order matters too: fetch-live-news does not care about order, but a matching
// order makes the file a faithful mirror of getAllTickers() and keeps diffs clean.
const orderMismatch =
  book.length === TRACKED_TICKERS.length &&
  book.some((t, i) => t !== TRACKED_TICKERS[i]);

if (missingFromApi.length || extraInApi.length || orderMismatch) {
  console.error("\n✗ DRIFT — api/trackedTickers.js is out of sync with the client book.\n");
  if (missingFromApi.length)
    console.error(`  In book but MISSING from api list: ${missingFromApi.join(", ")}`);
  if (extraInApi.length)
    console.error(`  In api list but NOT in book:        ${extraInApi.join(", ")}`);
  if (orderMismatch && !missingFromApi.length && !extraInApi.length)
    console.error("  Same tickers, different order — re-sync to getAllTickers() order.");
  console.error(
    "\n  Fix: update the array in api/trackedTickers.js to match getAllTickers().\n" +
      "  Current book order:\n  " +
      JSON.stringify(book) +
      "\n",
  );
  process.exit(1);
}

console.log(
  `✓ api/trackedTickers.js in sync with client book (${book.length} tickers).`,
);
