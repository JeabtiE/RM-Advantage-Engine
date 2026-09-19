// NewsRail.jsx — the left pane: pick a news item, see its pipeline state, run
// the analysis. This is the iPad Stocks symbol list, with news items in place of
// symbols.
//
// SPLIT OUT OF NewsFeed (Phase 6.1). Before this, news selection was a peer TAB
// of the three working views, so choosing an item and reviewing its analysis
// were never on screen together — the CIO had to leave the approval view to
// change the input to it. As a permanent rail, selection and review sit side by
// side, which is the whole point of the two-pane layout.
//
// What moved where: the list, the source switcher, the live-mode notice and the
// analyze trigger live here. The RESULT of an analysis (the verdict, sentiment,
// fact check, client preview) moved to the Approval pane, where the CIO acts on
// it — it was previously duplicated in both places almost verbatim.
//
//   props:
//     items          — the news list for the active source
//     selectedId     — id of the chosen item (owned by App)
//     onSelect       — (news) => void
//     onAnalyze      — () => void   (runs the pipeline for the selection)
//     statusFor      — (newsId) => NEWS_STATUS key, for the per-row glyph
//     isAnalyzing    — pipeline busy (locks selection + source switching)
//     source/onSourceChange — preset | live
//     live*          — loading / error / count for the live source

import {
  Button,
  EmptyState,
  Notice,
  StatusGlyph,
  Tag,
} from "./ui.jsx";
import { IconFilter, IconRefresh } from "./icons.jsx";

export const SOURCES = { PRESET: "preset", LIVE: "live" };

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
  items,
  selectedId,
  onSelect,
  onAnalyze,
  statusFor,
  isAnalyzing,
  source,
  onSourceChange,
  liveLoading,
  liveError,
  liveCount,
}) {
  const isLive = source === SOURCES.LIVE;
  const hasSelection = Boolean(selectedId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Pane header — floating chrome, so rows scroll under it */}
      <div className="chrome sticky top-0 z-10 border-b border-hairline px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-caption font-semibold tracking-[0.08em] uppercase text-text-3">
            News
          </h2>
          <div className="flex items-center gap-1">
            <SourceToggle
              source={source}
              onChange={onSourceChange}
              disabled={isAnalyzing}
            />
          </div>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="pane-scroll min-h-0 flex-1">
        {isLive && (
          <div className="px-4 pt-3">
            <Notice tone="flat" title="Live source">
              <p>
                Demonstrates the real-data connection. Client matching may be
                less precise than the reviewed demo scenarios.
              </p>
              {!liveLoading && !liveError && liveCount > 0 && (
                <p className="mt-1.5 text-text-3">
                  Yahoo Finance RSS, filtered to tickers clients actually hold (
                  {liveCount} items)
                </p>
              )}
            </Notice>
          </div>
        )}

        {isLive && liveLoading && (
          <div className="px-4 py-6">
            <EmptyState title="Fetching live news…" hint="Yahoo Finance RSS" />
          </div>
        )}

        {isLive && liveError && (
          <div className="px-4 py-3">
            <Notice tone="alert" title="Couldn't fetch live news">
              <p className="break-words">{liveError}</p>
              <p className="mt-1.5 text-text-3">
                Demo news still works — it doesn't depend on the live source.
              </p>
            </Notice>
          </div>
        )}

        {isLive && !liveLoading && !liveError && liveCount === 0 && (
          <div className="px-4 py-6">
            <EmptyState
              title="No live news right now"
              hint="Nothing new for the tickers clients hold"
            />
          </div>
        )}

        {!(isLive && (liveLoading || liveError)) && (
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
                            active
                              ? "font-semibold text-text"
                              : "text-text-2"
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
        )}
      </div>

      {/* Action bar — pinned to the bottom of the rail, floating chrome. The
          analyze trigger belongs to the pane that owns the selection. */}
      <div className="chrome border-t border-hairline px-4 py-3">
        <Button
          variant="primary"
          className="w-full"
          onClick={onAnalyze}
          disabled={!hasSelection || isAnalyzing}
          title={
            hasSelection
              ? undefined
              : "Select a news item first"
          }
        >
          {isAnalyzing ? "Analyzing…" : "Analyze"}
        </Button>
      </div>
    </div>
  );
}

// SourceToggle — preset vs live. Two options only, so it is a pair of icon
// buttons rather than a segmented control competing with the destination bar.
function SourceToggle({ source, onChange, disabled }) {
  const opts = [
    { id: SOURCES.PRESET, icon: IconFilter, label: "Demo news (reviewed scenarios)" },
    { id: SOURCES.LIVE, icon: IconRefresh, label: "Live news (Yahoo Finance RSS)" },
  ];
  return (
    <div className="flex gap-0.5 rounded-control bg-surface p-0.5">
      {opts.map((o) => {
        const active = source === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => !disabled && onChange(o.id)}
            aria-label={o.label}
            aria-pressed={active}
            aria-disabled={disabled || undefined}
            title={o.label}
            className={`grid h-7 w-7 place-items-center rounded-tag transition-colors duration-(--duration-fast) ease-(--ease-out) ${
              active ? "bg-raised text-text" : "text-text-3 hover:text-text-2"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <o.icon size={15} />
          </button>
        );
      })}
    </div>
  );
}
