// App.jsx — root layout and the SINGLE owner of draft state.
//
// After the state lift (see CLAUDE.md → Implementation Notes → state-lifting
// plan): App calls useDraft() once and passes the relevant pieces down. This is
// what makes the Four Eyes flow coherent — the draft NewsFeed produces is the
// exact same draft ApprovalDashboard reviews and (on approval) Agent 3 scripts.
// There is only one draft instance in the whole app.
//
// Pill tabs switch between the two built views; ClientList / ScriptViewer will
// slot in as further tabs later, reading from this same useDraft().

import { useState } from "react";
import { useDraft, DraftStatus } from "./hooks/useDraft.js";
import NewsFeed from "./components/NewsFeed.jsx";
import ApprovalDashboard from "./components/ApprovalDashboard.jsx";
import ClientList from "./components/ClientList.jsx";
import ScriptViewer from "./components/ScriptViewer.jsx";

const TABS = [
  { id: "news", label: "ข่าว", icon: "📰" },
  { id: "approval", label: "อนุมัติ (Four Eyes)", icon: "✅" },
  { id: "clients", label: "ลูกค้าที่กระทบ", icon: "👥" },
  { id: "scripts", label: "สคริปต์", icon: "💬" },
];

export default function App() {
  // The one and only draft controller. Every view reads/writes through this.
  const {
    status,
    draft,
    scripts,
    error,
    relevance,
    analyzeNews,
    approve,
    reject,
    retryScripts,
    reset,
  } = useDraft();
  const [tab, setTab] = useState("news");

  // A draft waiting on the CIO — used to flag the Approval tab so the demo
  // driver knows the same draft is now available to review there.
  const pendingReview = draft && status === DraftStatus.PENDING;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              RM
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                ระบบข่าวสู่การลงมือ (News-to-Action)
              </h1>
              <p className="text-xs text-slate-500">
                วิเคราะห์ผลกระทบ ตรวจหา Dislocation และอนุมัติแบบ Four Eyes
              </p>
            </div>
          </div>
        </header>

        {/* Pill tabs — light track, active tab = raised white pill */}
        <nav className="inline-flex rounded-xl bg-slate-100 p-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            const showDot = t.id === "approval" && pendingReview;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span aria-hidden>{t.icon}</span>
                {t.label}
                {showDot && (
                  <span className="ml-1 inline-block h-2 w-2 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Active view — all read from the same useDraft() above */}
        {tab === "news" && (
          <NewsFeed
            status={status}
            draft={draft}
            error={error}
            relevance={relevance}
            analyzeNews={analyzeNews}
            reset={reset}
          />
        )}
        {tab === "approval" && (
          <ApprovalDashboard
            draft={draft}
            onApprove={approve}
            onReject={reject}
          />
        )}
        {tab === "clients" && <ClientList draft={draft} />}
        {tab === "scripts" && (
          <ScriptViewer draft={draft} scripts={scripts} onRetry={retryScripts} />
        )}
      </div>
    </div>
  );
}
