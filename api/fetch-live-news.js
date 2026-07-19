// api/fetch-live-news.js — Vercel serverless proxy for Yahoo Finance RSS.
//
// WHY SERVER-SIDE: Yahoo's RSS host sends no CORS headers, so a browser fetch
// from the Vite app is blocked. Same reason the teammate's finance-dashboard
// proxies /api/news rather than calling Yahoo from the client.
//
// SCOPE: isolated endpoint. Nothing here is wired into NewsFeed/useDraft/the
// draft pipeline, and per hard constraint #5 the live demo must keep running
// off mockNews.js — this is exploratory plumbing, not a demo dependency.
//
// ---------------------------------------------------------------------------
// FIELD REALITY (measured against the live feed on 2026-07-17, not assumed)
//
// Yahoo's per-ticker RSS exposes ONLY these item tags:
//     <title> <link> <pubDate> <guid> <description>
//
// Two fields in the teammate's { title, link, pubDate, source, relatedTickers }
// shape DO NOT EXIST in this feed and are synthesized here:
//   - `source`         — derived from the link's hostname.
//   - `relatedTickers` — set to the ticker(s) whose feed carried the item.
//                        Yahoo's quote API has a real relatedTickers field;
//                        this RSS endpoint does not.
//
// KNOWN LIMITATION — CONTENT DEPTH: the feed is NOT headline-only (the fallback
// the task anticipated), but it is not full article text either. <description>
// carries the article lede, ~75–660 chars, truncated mid-word around 500. We
// therefore build `content` as title + description and mark it truncated.
// Fetching the linked article for full body text was tested and rejected: links
// frequently leave Yahoo for third-party publishers (e.g. a CPN.BK item landing
// on worldconstructionnetwork.com) that sit behind consent walls and would need
// per-domain scrapers. Agent 1 gets a lede, not a body.
// ---------------------------------------------------------------------------

import { TRACKED_TICKERS } from "./trackedTickers.js";

// Our tracked tickers live in a SELF-CONTAINED module inside api/ (not imported
// from src/data/mockClients.js) so this serverless function's bundle never
// reaches outside api/ — see api/trackedTickers.js for the deploy-safety
// rationale and the drift guard (npm run check:tickers) that keeps the list in
// sync with the real client book.

// Thai listings REQUIRE the .BK (SET) suffix on Yahoo. This is not cosmetic:
// a bare symbol silently resolves to a DIFFERENT company rather than failing.
// Measured: `PTT` returns news for PTT Synergy Group Berhad (KLSE:PTT, a
// Malaysian firm); only `PTT.BK` returns PTT Public Company Limited. Bare
// `KBANK` returns an empty feed. Wrong-company news scoring as a real match
// would be worse than no news at all, so the suffix is applied unconditionally.
const SET_SUFFIX = ".BK";

const YAHOO_RSS = "https://feeds.finance.yahoo.com/rss/2.0/headline";

// Yahoo answers 200 with an empty feed for unknown symbols, so timeouts are the
// only real hang risk. Keep per-fetch short and concurrency modest: the whole
// 25-ticker book must finish inside the serverless execution window.
const FETCH_TIMEOUT_MS = 4000;
const CONCURRENCY = 6;

export const config = { maxDuration: 15 };

const XML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g, (m) => XML_ENTITIES[m] ?? m)
    .trim();
}

// Regex parsing rather than an XML dependency: the project ships zero runtime
// deps beyond React, and this feed is flat RSS 2.0 with no CDATA and no nesting
// inside <item> (verified against the live feed). If Yahoo ever adds CDATA or
// namespaced tags, swap in a real parser instead of hardening these patterns.
function tagText(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntities(match[1]) : "";
}

// Scoped to <item> blocks on purpose: <channel> carries its own <title>,
// <link> and <description> ("Latest Financial News for TRUE.BK"), which a
// document-wide match would happily return as a phantom article.
function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
}

function sourceFromLink(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function toSymbol(ticker) {
  const upper = String(ticker).trim().toUpperCase();
  return upper.endsWith(SET_SUFFIX) ? upper : upper + SET_SUFFIX;
}

async function fetchTickerNews(ticker) {
  const symbol = toSymbol(ticker);
  const url = `${YAHOO_RSS}?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;

  // AbortController rather than Promise.race so a slow feed does not keep the
  // socket alive after we have stopped waiting for it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Yahoo serves an interstitial to unrecognized clients.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RMAdvantageEngine/0.1)" },
    });

    if (!res.ok) {
      return { ticker, symbol, items: [], error: `HTTP ${res.status}` };
    }

    const xml = await res.text();

    const items = parseItems(xml)
      .map((raw) => {
        const title = tagText(raw, "title");
        const link = tagText(raw, "link");
        const description = tagText(raw, "description");
        if (!title || !link) return null; // malformed entry — drop rather than emit a half-item

        return {
          id: tagText(raw, "guid") || link,
          title,
          link,
          pubDate: tagText(raw, "pubDate") || null,
          source: sourceFromLink(link),
          relatedTickers: [ticker],
          // What Agent 1 would actually read. Lede only — see header note.
          content: description ? `${title}\n\n${description}` : title,
          contentTruncated: description.length >= 490,
          headlineOnly: description.length === 0,
        };
      })
      .filter(Boolean);

    return { ticker, symbol, items, error: null };
  } catch (err) {
    // AbortError included: a dead feed degrades to "no news for this ticker",
    // never to a failed request for the whole book.
    return { ticker, symbol, items: [], error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(inputs, limit, fn) {
  const results = [];
  for (let i = 0; i < inputs.length; i += limit) {
    const batch = inputs.slice(i, i + limit);
    // allSettled per hard constraint #4 — one rejecting feed must not void the batch.
    const settled = await Promise.allSettled(batch.map(fn));
    settled.forEach((r, idx) => {
      results.push(
        r.status === "fulfilled"
          ? r.value
          : { ticker: batch[idx], symbol: toSymbol(batch[idx]), items: [], error: String(r.reason) }
      );
    });
  }
  return results;
}

// The same article surfaces under several tickers (sector-wide stories), which
// is exactly the signal relatedTickers is meant to carry — so merge duplicates
// into one item listing every ticker it touched, rather than emitting it twice.
function dedupe(perTicker) {
  const byId = new Map();
  for (const { items } of perTicker) {
    for (const item of items) {
      const existing = byId.get(item.id);
      if (existing) {
        for (const t of item.relatedTickers) {
          if (!existing.relatedTickers.includes(t)) existing.relatedTickers.push(t);
        }
      } else {
        byId.set(item.id, { ...item });
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0)
  );
}

export default async function handler(req, res) {
  // Outer try-catch is the "never crash" backstop: any unforeseen throw still
  // leaves the caller with a valid, empty, flagged payload.
  try {
    const requested = (req.query?.tickers ?? "")
      .split(",")
      .map((t) => t.trim().toUpperCase().replace(/\.BK$/, ""))
      .filter(Boolean);

    // Reject anything outside our book. Guards the wrong-company trap above and
    // keeps the symbol out of a URL we build from caller input.
    const unknown = requested.filter((t) => !TRACKED_TICKERS.includes(t));
    const tickers = requested.length
      ? requested.filter((t) => TRACKED_TICKERS.includes(t))
      : TRACKED_TICKERS;

    if (requested.length && !tickers.length) {
      return res.status(400).json({
        ok: false,
        error: `No tracked tickers in request. Unknown: ${unknown.join(", ")}`,
        unknownTickers: unknown,
        items: [],
      });
    }

    const perTicker = await mapWithConcurrency(tickers, CONCURRENCY, fetchTickerNews);
    const items = dedupe(perTicker);
    const failed = perTicker.filter((r) => r.error);

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    return res.status(200).json({
      ok: true,
      error: null,
      items,
      meta: {
        requestedTickers: tickers,
        suffixApplied: SET_SUFFIX,
        tickersQueried: tickers.length,
        tickersWithNews: perTicker.filter((r) => r.items.length).length,
        tickersWithoutNews: perTicker.filter((r) => !r.items.length && !r.error).map((r) => r.ticker),
        unknownTickers: unknown,
        failures: failed.map((r) => ({ ticker: r.ticker, error: r.error })),
        // Surfaced so callers cannot mistake a lede for a full article.
        contentNote: "content = title + RSS description (article lede, ~500 char cap). Not full body text.",
      },
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err?.message ?? "Unknown failure fetching live news",
      items: [],
      meta: { failures: [], contentNote: null },
    });
  }
}
