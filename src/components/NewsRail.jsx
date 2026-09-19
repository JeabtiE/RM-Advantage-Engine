// NewsRail.jsx — the left pane: pick a news item, see its pipeline state, run
// the analysis. This is the iPad Stocks symbol list, with news items in place of
// symbols.
//
// SPLIT OUT OF NewsFeed (Phase 6.1). Before this, news selection was a peer TAB
// of the three working views, so choosing an item and reviewing its analysis
// were never on screen together. As a permanent rail, selection and review sit
// side by side, which is the whole point of the two-pane layout.
//
// PHASE 6.3 — ONE LIST, TWO SECTIONS. The rail used to show live OR demo news,
// switched by a toggle, so you could not see both at once and the live source
// was something you had to go looking for. Now both render together, live
// first, each under its own label. The toggle is gone; what remains is a
// refresh control on the live section, which is the only thing the toggle was
// still useful for.
//
// Two rules this section ordering has to respect:
//   1. The FIRST-LOAD selection is a cached demo scenario (App picks it), so a
//      first-time visitor lands on something that analyses end to end rather
//      than on a live item that needs a key.
//   2. The live section states UP FRONT that live analysis needs local live
//      mode. Discovering that from a failure after clicking Analyze is the
//      thing this hint exists to prevent.
//
//   props:
//     liveItems / demoItems — the two sections, already split by App
//     selectedId     — id of the chosen item (owned by App)
//     onSelect       — (news) => void
//     onAnalyze      — () => void   (runs the pipeline for the selection)
//     onRefreshLive  — () => void   (re-pulls the RSS feed)
//     statusFor      — (newsId) => NEWS_STATUS key, for the per-row glyph
//     isAnalyzing    — pipeline busy (locks selection + refresh)
//     liveLoading / liveError — state of the live fetch

import { useState } from "react";
import { Button, EmptyState, IconButton, Notice, StatusGlyph, Tag } from "./ui.jsx";
import { IconChevronDown, IconRefresh } from "./icons.jsx";

// How many live items to show before collapsing the rest behind a toggle.
//
// WHY A CAP AT ALL: the live feed returns ~40 headlines. Rendering them all
// above the Demo section pushed Demo — which holds the first-load selection and
// is the only path that analyses without a key — completely below the fold, so
// the app opened on a wall of headlines with its own selection invisible. The
// cap keeps both sections on screen at once; the full list is one click away
// and the count is always shown, so nothing is hidden silently.
const LIVE_PREVIEW_COUNT = 5;

// Format a publishedAt ISO string as a compact date (demo-safe: no locale
// dependency beyond the browser's Intl). English UI, so en-GB gives "7 Jul".
function formatDate(iso) {
  if (!iso) return ""; // live items can arrive without a pubDate
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function NewsRail({
  liveItems = [],
  demoItems = [],
  selectedId,
  onSelect,
  onAnalyze,
  onRefreshLive,
  statusFor,
  isAnalyzing,
  liveLoading,
  liveError,
}) {
  const hasSelection = Boolean(selectedId);
  const [liveExpanded, setLiveExpanded] = useState(false);
  const liveShown = liveExpanded
    ? liveItems
    : liveItems.slice(0, LIVE_PREVIEW_COUNT);
  const liveHidden = liveItems.length - liveShown.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Pane header — floating glass, so rows scroll under it */}
      <div className="chrome sticky top-0 z-10 border-b border-hairline px-4 py-3">
        <h2 className="text-caption font-semibold tracking-[0.08em] uppercase text-text-3">
          News
        </h2>
      </div>

      {/* Scrollable list — LIVE first, then DEMO */}
      <div className="pane-scroll min-h-0 flex-1">
        <SectionHeader
          label="Live"
          action={
            <IconButton
              label="Refresh live news"
              icon={IconRefresh}
              onClick={onRefreshLive}
              aria-disabled={isAnalyzing || liveLoading || undefined}
              className={
                isAnalyzing || liveLoading ? "cursor-not-allowed opacity-50" : ""
              }
            />
          }
        />

        {/* The hint that has to arrive BEFORE the click, not as an error after
            it. It states the requirement rather than claiming a state: the
            client cannot know whether the server's kill switch is on without
            making the very call this warns about. */}
        <p className="px-4 pb-2 text-caption leading-relaxed text-text-3">
          Real headlines from Yahoo Finance RSS. Analysing one needs local live
          mode — on the public demo it is switched off. The demo items below run
          every step with no key.
        </p>

        {liveLoading && (
          <p className="px-4 pb-3 text-caption text-text-3">Fetching…</p>
        )}

        {liveError && !liveLoading && (
          <div className="px-4 pb-3">
            <Notice tone="alert" title="Couldn't fetch live news">
              <p className="break-words">{liveError}</p>
              <p className="mt-1.5 text-text-3">
                Demo items are unaffected — they don't use this source.
              </p>
            </Notice>
          </div>
        )}

        {!liveLoading && !liveError && liveItems.length === 0 && (
          <p className="px-4 pb-3 text-caption text-text-3">
            Nothing new for the tickers clients hold.
          </p>
        )}

        {liveShown.length > 0 && (
          <NewsGroup
            items={liveShown}
            selectedId={selectedId}
            onSelect={onSelect}
            statusFor={statusFor}
          />
        )}

        {/* The count is always visible, so the cap never hides the fact that
            there is more. Expanding is sticky for the session — a user who
            wants the whole feed keeps it. */}
        {liveItems.length > LIVE_PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() => setLiveExpanded((v) => !v)}
            aria-expanded={liveExpanded}
            className="flex w-full items-center justify-center gap-1.5 border-b border-hairline px-4 py-2.5 text-caption font-semibold text-text-2 transition-colors duration-(--duration-fast) ease-(--ease-out) hover:bg-surface hover:text-text"
          >
            {liveExpanded ? "Show fewer" : `Show ${liveHidden} more live`}
            <IconChevronDown
              size={14}
              className={`transition-transform duration-(--duration-base) ease-(--ease-out) ${
                liveExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        )}

        <SectionHeader
          label="Demo"
          action={
            <span className="text-caption text-text-3">Reviewed scenarios</span>
          }
        />
        {demoItems.length === 0 ? (
          <div className="px-4 pb-4">
            <EmptyState title="No demo items" />
          </div>
        ) : (
          <NewsGroup
            items={demoItems}
            selectedId={selectedId}
            onSelect={onSelect}
            statusFor={statusFor}
          />
        )}
      </div>

      {/* Action bar — pinned to the bottom of the rail, floating glass. The
          analyze trigger belongs to the pane that owns the selection. */}
      <div className="chrome border-t border-hairline px-4 py-3">
        <Button
          variant="primary"
          className="w-full"
          onClick={onAnalyze}
          disabled={!hasSelection || isAnalyzing}
          title={hasSelection ? undefined : "Select a news item first"}
        >
          {isAnalyzing ? "Analyzing…" : "Analyze"}
        </Button>
      </div>
    </div>
  );
}

// SectionHeader — a sticky-ish label separating Live from Demo. It sits on the
// page surface rather than on glass: it scrolls with its own rows, so blurring
// it would make it read as chrome it isn't.
function SectionHeader({ label, action }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
      <h3 className="text-caption font-semibold tracking-[0.08em] uppercase text-text-2">
        {label}
      </h3>
      {action}
    </div>
  );
}

function NewsGroup({ items, selectedId, onSelect, statusFor }) {
  return (
    <ul>
      {items.map((news) => {
        const active = news.id === selectedId;
        return (
          <li key={news.id}>
            <button
              onClick={() => onSelect(news)}
              aria-pressed={active}
              className={`w-full border-b border-hairline px-4 py-3 text-left transition-colors duration-(--duration-fast) ease-(--ease-out) ${
                active ? "bg-raised" : "hover:bg-surface"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="pt-0.5">
                  <StatusGlyph status={statusFor(news.id)} />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-caption leading-snug ${
                      active ? "font-semibold text-text" : "text-text-2"
                    }`}
                  >
                    {news.headline}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-caption text-text-3">
                      {news.source}
                    </span>
                    <span className="tnum text-caption text-text-3">
                      {formatDate(news.publishedAt)}
                    </span>
                  </div>
                  {(news.relatedTickers ?? []).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {news.relatedTickers.map((t) => (
                        <Tag key={t}>{t}</Tag>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
