// App.jsx — the two-pane shell and the SINGLE owner of draft state.
//
// State ownership (Phase 6.1 lifted `selectedId` up here):
//   useDraft()  — the one draft instance. The draft NewsRail's selection
//                 produces is the exact draft ApprovalDashboard reviews and
//                 Agent 3 scripts. See CLAUDE.md → state-lifting plan.
//   selectedId  — which news item the rail has selected. This WAS local to
//                 NewsFeed, which was fine while news was a peer tab; once the
//                 rail is permanently on screen next to the working views, both
//                 panes need it, so it lives here.
//   view        — which of the three destinations the right pane shows.
//
// Layout: >=1024px is two panes, each scrolling independently inside a shell
// that is exactly viewport-high (no page scroll). Below that it collapses to one
// column with the news list behind a disclosure at the top — a 340px rail and a
// working area cannot both be usable at 390px, and the rail is the thing you
// touch once per task.

import { useState, useEffect, useCallback } from "react";
import { useDraft, DraftStatus } from "./hooks/useDraft.js";
import { mockNews } from "./data/mockNews.js";
import { fetchLiveNews } from "./utils/liveNews.js";
import NewsRail, { SOURCES } from "./components/NewsRail.jsx";
import ApprovalDashboard from "./components/ApprovalDashboard.jsx";
import ClientList from "./components/ClientList.jsx";
import ScriptViewer from "./components/ScriptViewer.jsx";
import { SegmentedBar } from "./components/ui.jsx";
import {
  IconApproval,
  IconChevronDown,
  IconClients,
  IconScripts,
} from "./components/icons.jsx";

const VIEWS = { APPROVAL: "approval", CLIENTS: "clients", SCRIPTS: "scripts" };

export default function App() {
  const {
    status,
    draft,
    scripts,
    error,
    errorCode,
    relevance,
    stage,
    analyzeNews,
    approve,
    reject,
    retryScripts,
    reset,
  } = useDraft();

  const [view, setView] = useState(VIEWS.APPROVAL);
  const [selectedId, setSelectedId] = useState(null);
  const [source, setSource] = useState(SOURCES.PRESET);
  const [liveItems, setLiveItems] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const [railOpen, setRailOpen] = useState(false); // mobile disclosure only

  const isAnalyzing = status === DraftStatus.ANALYZING;
  const isLive = source === SOURCES.LIVE;
  const items = isLive ? liveItems : mockNews;
  const selectedNews = items.find((n) => n.id === selectedId) ?? null;

  // Auto-fetch on switching to live. Fires once per entry into live mode and
  // aborts on unmount / switch away, which also makes the StrictMode
  // double-invoke in dev harmless: the first pass aborts itself instead of
  // racing a second response into state. (Moved up from NewsFeed unchanged.)
  useEffect(() => {
    if (!isLive) return;

    const controller = new AbortController();
    setLiveLoading(true);
    setLiveError(null);

    fetchLiveNews({ signal: controller.signal })
      .then(({ items: fetched }) => {
        if (controller.signal.aborted) return;
        setLiveItems(fetched);
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        setLiveError(err?.message ?? String(err));
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLiveLoading(false);
      });

    return () => controller.abort();
  }, [isLive]);

  // Switching source drops the selection and any draft built from it —
  // otherwise the working pane would keep showing analysis for a headline no
  // longer in the list.
  const handleSourceChange = useCallback(
    (next) => {
      if (isAnalyzing || next === source) return; // don't switch mid-call
      setSource(next);
      setSelectedId(null);
      if (status !== DraftStatus.IDLE) reset();
    },
    [isAnalyzing, source, status, reset],
  );

  // Selecting a different item after a run clears the stale draft so the
  // working pane never shows analysis for the wrong headline.
  const handleSelect = useCallback(
    (news) => {
      if (isAnalyzing) return; // don't switch mid-call
      setSelectedId(news.id);
      setRailOpen(false); // mobile: collapse back to the working area
      if (status !== DraftStatus.IDLE) reset();
    },
    [isAnalyzing, status, reset],
  );

  const handleAnalyze = useCallback(() => {
    if (selectedNews && !isAnalyzing) {
      analyzeNews(selectedNews);
      setView(VIEWS.APPROVAL); // the result is reviewed, so go where it lands
    }
  }, [selectedNews, isAnalyzing, analyzeNews]);

  // statusFor — the rail's per-row glyph. The hook holds ONE draft, so only the
  // item that draft belongs to can be in a non-idle state; every other row is
  // "not analyzed". Derived here rather than added to useDraft: it is a fact
  // about the view, not about the pipeline.
  const statusFor = useCallback(
    (newsId) => {
      if (draft?.draftId === newsId) {
        if (draft.status === DraftStatus.APPROVED) return "approved";
        if (draft.status === DraftStatus.REJECTED) return "rejected";
        // An approved draft whose Agent 3 batch failed is still APPROVED at the
        // gate — the rail reports the human decision, not the script outcome.
        if (draft.status === DraftStatus.SCRIPT_ERROR) return "approved";
        return "pending";
      }
      if (selectedId !== newsId) return "idle";
      if (isAnalyzing) return "analyzing";
      if (status === DraftStatus.ERROR) return "error";
      if (status === DraftStatus.NOT_RELEVANT) return "not_relevant";
      return "idle";
    },
    [draft, selectedId, isAnalyzing, status],
  );

  const clientCount = draft?.affectedClients?.length ?? null;
  const scriptCount = scripts?.filter((s) => s.ok).length ?? null;
  const approved =
    draft?.status === DraftStatus.APPROVED ||
    draft?.status === DraftStatus.SCRIPT_ERROR;

  const destinations = [
    {
      id: VIEWS.APPROVAL,
      label: "Approval",
      icon: IconApproval,
      hint: "Four Eyes review — nothing reaches a client without it",
      disabledReason: null,
    },
    {
      id: VIEWS.CLIENTS,
      label: "Clients",
      icon: IconClients,
      count: clientCount,
      hint: "Affected clients, ranked by priority",
      disabledReason: draft
        ? null
        : "Analyze a news item to see affected clients",
    },
    {
      id: VIEWS.SCRIPTS,
      label: "Scripts",
      icon: IconScripts,
      count: scriptCount,
      hint: "Per-client call scripts",
      disabledReason: approved
        ? null
        : "Scripts are generated only after Four Eyes approval",
    },
  ];

  const rail = (
    <NewsRail
      items={items}
      selectedId={selectedId}
      onSelect={handleSelect}
      onAnalyze={handleAnalyze}
      statusFor={statusFor}
      isAnalyzing={isAnalyzing}
      source={source}
      onSourceChange={handleSourceChange}
      liveLoading={liveLoading}
      liveError={liveError}
      liveCount={liveItems.length}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      {/* App header — floating chrome across both panes */}
      <header className="chrome z-20 flex shrink-0 items-center justify-between gap-4 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-tag border border-hairline-strong text-caption font-bold text-text-2">
            RM
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-caption font-semibold text-text">
              News-to-Action
            </h1>
            <p className="truncate text-caption text-text-3">
              Impact analysis, dislocation detection, Four Eyes approval
            </p>
          </div>
        </div>
        <span className="shrink-0 text-caption text-text-3">CIO</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[340px_1fr] xl:grid-cols-[380px_1fr]">
        {/* Left pane — desktop only. Full height, scrolls on its own. */}
        <aside className="hidden min-h-0 border-r border-hairline lg:block">
          {rail}
        </aside>

        {/* Mobile: the rail collapses to a disclosure at the top of the single
            column. It reports the current selection so the working area below
            always has a visible subject. */}
        <div className="shrink-0 border-b border-hairline lg:hidden">
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            aria-expanded={railOpen}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-caption text-text-3">News</span>
              <span className="block truncate text-caption font-semibold text-text">
                {selectedNews?.headline ?? "Select a news item"}
              </span>
            </span>
            <IconChevronDown
              size={16}
              className={`text-text-3 transition-transform duration-(--duration-base) ease-(--ease-out) ${
                railOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          {railOpen && (
            <div className="max-h-[60dvh] border-t border-hairline">{rail}</div>
          )}
        </div>

        {/* Right pane — the working area */}
        <main className="pane-scroll min-h-0 flex-1">
          <div className="chrome sticky top-0 z-10 px-4 pt-3 pb-2">
            <SegmentedBar
              items={destinations}
              active={view}
              onChange={setView}
            />
          </div>
          <div className="px-4 pt-2 pb-8">
            {view === VIEWS.APPROVAL && (
              <ApprovalDashboard
                draft={draft}
                status={status}
                error={error}
                errorCode={errorCode}
                relevance={relevance}
                stage={stage}
                selectedNews={selectedNews}
                onApprove={approve}
                onReject={reject}
                onRetry={handleAnalyze}
              />
            )}
            {view === VIEWS.CLIENTS && <ClientList draft={draft} />}
            {view === VIEWS.SCRIPTS && (
              <ScriptViewer
                draft={draft}
                scripts={scripts}
                stage={stage}
                onRetry={retryScripts}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
