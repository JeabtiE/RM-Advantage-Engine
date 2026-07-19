// liveNews.js — adapts /api/fetch-live-news payloads into the shape the
// existing pipeline already consumes (the mockNews item shape).
//
// WHY AN ADAPTER RATHER THAN PIPELINE CHANGES: analyzeImpact/factCheck/matching
// and useDraft are untouched by live mode. Everything live news needs to be a
// first-class news item is done HERE, so the pipeline cannot tell the two apart
// and hard constraint #5 stays verifiable by inspection.
//
// SCOPE (Phase 13): live fetch proves "the pipeline ingests real news". It is
// explicitly NOT a second dislocation demo case — see LIVE_NO_MARKET_OUTCOME.

// Live ids are namespaced so they can NEVER collide with a cached demo key.
// This is the mechanical guarantee behind hard constraint #5: useDraft's
// getCachedRun() short-circuits on an EXACT id match against cachedDemoRuns
// ("N006"/"N003"), and no "LIVE-…" string can ever equal an "N###" key. So a
// live item can never hijack the cached demo path, and — the direction that
// actually matters at showtime — selecting N006/N003 from the preset list can
// never reach this module: it hits the cache and returns before any live code
// is consulted.
export const LIVE_ID_PREFIX = "LIVE-";

export function isLiveNewsId(id) {
  return String(id ?? "").startsWith(LIVE_ID_PREFIX);
}

// The marketOutcome a live item carries INSTEAD of real price data.
//
// Agent 1's prompt interpolates `${news.marketOutcome}` unconditionally, so
// leaving this undefined would send the literal string "undefined" to the model
// — an invitation to invent a market reaction, which Agent 2 would then flag as
// a hallucination. Rather than edit the (verified, unchanged) prompt, we state
// the absence explicitly and honestly in the data, and tell the model what NOT
// to conclude from it. Expected result: dislocation_detected: false, every time.
//
// This is the truthful description of the limitation found in Phase 12: Yahoo
// Finance RSS carries article text only — there is no companion price feed, and
// dislocation detection is precisely a comparison of expectation vs actual move.
export const LIVE_NO_MARKET_OUTCOME =
  "ไม่มีข้อมูลราคาตลาดประกอบข่าวชิ้นนี้ — ข่าวดึงสดจาก Yahoo Finance RSS " +
  "ซึ่งให้เฉพาะเนื้อหาข่าว ไม่มีข้อมูลการเคลื่อนไหวของราคาหลังข่าวออก " +
  "จึงไม่สามารถเปรียบเทียบสิ่งที่ทฤษฎีบอกว่าควรเกิดขึ้น กับสิ่งที่ตลาดทำจริงได้ " +
  "ห้ามสรุปว่าพบ dislocation จากข้อมูลที่ไม่มีอยู่ และห้ามคาดเดาการเคลื่อนไหวของราคา " +
  "ให้ตั้ง dislocation_detected เป็น false และวิเคราะห์เฉพาะผลกระทบเชิงทฤษฎีจากเนื้อข่าวเท่านั้น";

// Stable id from the article link so re-fetching does not reshuffle ids under a
// user's current selection (djb2 — a react key + draftId, not a security hash).
function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

// adaptLiveItem — one API item → one pipeline news item.
//
// The appended provenance line does real work beyond display: filterRelevantNews
// screens on headline+content TEXT, but a live headline often names the company
// ("Kasikornbank") without ever printing the ticker ("KBANK"), which would get an
// item we KNOW is about a held position screened out as irrelevant before Agent 1.
// The tickers are not invented — the item came from those tickers' feeds — so
// naming them here is honest provenance that also lets the existing filter and
// Agent 1 see the link to the book.
export function adaptLiveItem(item) {
  const tickers = item.relatedTickers ?? [];
  const provenance =
    `\n\n[ที่มา: ${item.source ?? "unknown"}` +
    (tickers.length ? ` | หุ้นที่เกี่ยวข้องในพอร์ตลูกค้า: ${tickers.join(", ")}` : "") +
    `]`;

  return {
    id: LIVE_ID_PREFIX + hashId(item.link ?? item.id ?? item.title ?? ""),
    headline: item.title,
    // item.content is already "title\n\ndescription" from the endpoint — the
    // article lede, not full body text (documented limitation, Phase 12).
    content: (item.content ?? item.title ?? "") + provenance,
    source: item.source ?? "Yahoo Finance",
    publishedAt: item.pubDate ?? null,
    marketOutcome: LIVE_NO_MARKET_OUTCOME,
    // UI-only provenance; the pipeline ignores these extra fields.
    liveLink: item.link,
    relatedTickers: tickers,
  };
}

// fetchLiveNews — call the serverless proxy and adapt the payload.
// Never throws for an expected failure: the endpoint reports { ok, error } and
// we surface that as a message the caller renders. `signal` supports abort on
// unmount / mode switch.
export async function fetchLiveNews({ tickers = [], signal } = {}) {
  const qs = tickers.length ? `?tickers=${encodeURIComponent(tickers.join(","))}` : "";
  const res = await fetch(`/api/fetch-live-news${qs}`, { signal });

  // The endpoint answers 200 with { ok: false } for handled failures; a non-200
  // means the function itself did not run (dev proxy down, deploy issue).
  if (!res.ok) {
    throw new Error(`ดึงข่าวสดไม่สำเร็จ (HTTP ${res.status})`);
  }

  const payload = await res.json();
  if (!payload.ok) {
    throw new Error(payload.error ?? "ดึงข่าวสดไม่สำเร็จ");
  }

  return {
    items: (payload.items ?? []).map(adaptLiveItem),
    meta: payload.meta ?? null,
  };
}
