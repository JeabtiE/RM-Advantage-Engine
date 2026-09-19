// NewsFeed.jsx — news selection + trigger analysis (stage [1]→[4] of the pipeline).
//
// PROPS-DRIVEN after the state lift: App now owns the single useDraft() instance
// (see CLAUDE.md → Implementation Notes → state-lifting plan) so the draft this
// component produces is the SAME draft ApprovalDashboard reviews. NewsFeed keeps
// only its own UI-local selection state (selectedId); everything pipeline-related
// comes in as props. The analyze flow and hero display are unchanged from the
// standalone version — only the source of state moved up.
//
//   props (all from useDraft in App):
//     status      — current DraftStatus
//     draft       — the draft (pending → drives the results hero) or null
//     error       — pipeline error message or null
//     errorCode   — endpoint error code or null ("live_mode_disabled" → notice, not failure)
//     relevance   — pre-filter verdict for the last analyzed item (or null)
//     analyzeNews — (news) => void   (runs Agent 1 → matching → Agent 2)
//     reset       — () => void       (clears a stale draft on re-selection)
//
// UI follows CLAUDE.md's design language: dark-navy hero card for the money-shot
// metric (affected-client count / dislocation alert), rounded white cards, pill
// selection, black primary button top-right. Thai UI, English code.

import { useState, useEffect } from "react";
import { mockNews } from "../data/mockNews.js";
import { DraftStatus } from "../hooks/useDraft.js";
import { calculateImpactShare, isKeyAccount } from "../utils/matching.js";
import { fetchLiveNews, isLiveNewsId } from "../utils/liveNews.js";
import KeyAccountBadge from "./KeyAccountBadge.jsx";
import { LIVE_MODE_DISABLED, RESPONSE_TRUNCATED } from "../utils/claudeAPI.js";
import { cachedDemoRuns } from "../data/cachedDemoRun.js";

// Preset items that resolve from the frozen cache (no API call). Derived from the
// cache itself so the "still works" list can never drift from what is cached.
const CACHED_DEMO_NEWS = mockNews.filter((n) =>
  Object.hasOwn(cachedDemoRuns, n.id),
);

// News sources the RM can pick between. "preset" is the audited demo path
// (mockNews + the N006/N003 cache); "live" pulls real headlines off Yahoo
// Finance RSS via our serverless proxy.
//
// Hard constraint #5 note: adding "live" does not put the demo on a live API.
// The preset list is unchanged and still resolves N006/N003 through the cache;
// live is a separate, opt-in source the demo never has to touch.
const SOURCES = {
  PRESET: "preset",
  LIVE: "live",
};

// Risk-profile → Thai label + pill styling for the affected-client badges.
const RISK_META = {
  conservative: { label: "ระมัดระวัง", cls: "bg-emerald-50 text-emerald-700" },
  moderate: { label: "ปานกลาง", cls: "bg-amber-50 text-amber-700" },
  aggressive: { label: "เชิงรุก", cls: "bg-rose-50 text-rose-700" },
};

const SENTIMENT_META = {
  positive: { label: "เชิงบวก", cls: "text-emerald-600" },
  negative: { label: "เชิงลบ", cls: "text-rose-600" },
  neutral: { label: "เป็นกลาง", cls: "text-slate-500" },
};

// Format a publishedAt ISO string as a compact Thai date (demo-safe: no locale
// dependency beyond the browser's Intl).
function formatDate(iso) {
  if (!iso) return ""; // live items can arrive without a pubDate
  try {
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function NewsFeed({
  status,
  draft,
  error,
  errorCode,
  relevance,
  analyzeNews,
  reset,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [source, setSource] = useState(SOURCES.PRESET);
  const [liveItems, setLiveItems] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);

  const isAnalyzing = status === DraftStatus.ANALYZING;
  const isLive = source === SOURCES.LIVE;
  const newsList = isLive ? liveItems : mockNews;
  const selectedNews = newsList.find((n) => n.id === selectedId) ?? null;

  // Auto-fetch on switching to live. Fires once per entry into live mode (not
  // on every render) and aborts on unmount / switch away, which also makes the
  // StrictMode double-invoke in dev harmless: the first pass aborts itself
  // instead of racing a second response into state.
  useEffect(() => {
    if (!isLive) return;

    const controller = new AbortController();
    setLiveLoading(true);
    setLiveError(null);

    fetchLiveNews({ signal: controller.signal })
      .then(({ items }) => {
        if (controller.signal.aborted) return;
        setLiveItems(items);
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

  // Switching source drops the current selection and any draft built from it —
  // otherwise the results panel would keep showing analysis for a headline no
  // longer visible in the list.
  function handleSourceChange(next) {
    if (isAnalyzing || next === source) return; // don't switch mid-call
    setSource(next);
    setSelectedId(null);
    if (status !== DraftStatus.IDLE) reset();
  }

  // Selecting a different news item after a run clears the stale draft so the
  // results panel never shows analysis for the wrong headline.
  function handleSelect(news) {
    if (isAnalyzing) return; // don't switch mid-call
    setSelectedId(news.id);
    if (status !== DraftStatus.IDLE) reset();
  }

  function handleAnalyze() {
    if (selectedNews && !isAnalyzing) analyzeNews(selectedNews);
  }

  return (
    <div className="space-y-6">
        {/* Section: news selection */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              ข่าวเข้าใหม่ (News Feed)
            </h2>
            <button
              onClick={handleAnalyze}
              disabled={!selectedNews || isAnalyzing}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isAnalyzing ? "กำลังวิเคราะห์…" : "วิเคราะห์ข่าวนี้"}
            </button>
          </div>

          {/* Source switcher — pill track, same treatment as the App tabs */}
          <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
            {[
              { id: SOURCES.PRESET, label: "ข่าวตัวอย่าง (Demo)", icon: "📋" },
              { id: SOURCES.LIVE, label: "ดึงข่าวสด", icon: "📡" },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => handleSourceChange(s.id)}
                disabled={isAnalyzing}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
                  source === s.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span aria-hidden>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>

          {/* Live-mode scope + limitation, stated UP FRONT (not on the results
              panel) so a judge who explores live mode reads it BEFORE running an
              analysis — the matching caveat is discovered, not disclosed, if it
              only appears after the fact. Covers the known sector-expansion
              over-inclusion on single-company real news (see CLAUDE.md → Known
              Limitations); the demo itself stays on the audited N006/N003 path. */}
          {isLive && (
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs leading-relaxed text-slate-600">
                โหมดข่าวสดใช้สำหรับสาธิตการเชื่อมต่อข้อมูลจริง
                ผลลัพธ์อาจมีความคลาดเคลื่อนในการจับคู่ลูกค้าเมื่อเทียบกับ Demo Scenario
                ที่ผ่านการตรวจสอบแล้ว
              </p>
              {!liveLoading && !liveError && liveItems.length > 0 && (
                <p className="mt-1.5 text-xs text-slate-400">
                  ดึงจาก Yahoo Finance RSS ตามรายชื่อหุ้นที่ลูกค้าถือครองจริง ({liveItems.length} ข่าว)
                </p>
              )}
            </div>
          )}

          {isLive && liveLoading && (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
              <p className="text-sm text-slate-500">กำลังดึงข่าวสด…</p>
            </div>
          )}

          {isLive && liveError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">
                ดึงข่าวสดไม่สำเร็จ
              </p>
              <p className="mt-1 break-words text-xs text-amber-700">{liveError}</p>
              <p className="mt-2 text-xs text-amber-600">
                ข่าวตัวอย่าง (Demo) ยังใช้งานได้ตามปกติ — ไม่ขึ้นกับแหล่งข่าวสด
              </p>
            </div>
          )}

          {isLive && !liveLoading && !liveError && liveItems.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">ไม่พบข่าวสดในขณะนี้</p>
              <p className="mt-1 text-xs text-slate-400">
                แหล่งข่าวไม่มีข่าวใหม่สำหรับหุ้นที่ลูกค้าถือครอง
              </p>
            </div>
          )}

          {!(isLive && (liveLoading || liveError)) && (
            <ul className="space-y-2">
              {newsList.map((news) => {
                const active = news.id === selectedId;
                return (
                  <li key={news.id}>
                    <button
                      onClick={() => handleSelect(news)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        active
                          ? "border-slate-900 bg-slate-900/5 ring-1 ring-slate-900"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900">
                          {news.headline}
                        </p>
                        <span className="shrink-0 text-xs text-slate-400">
                          {formatDate(news.publishedAt)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="text-xs text-slate-500">{news.source}</p>
                        {(news.relatedTickers ?? []).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Live analysis switched off server-side (LIVE_AGENT_ENABLED unset) —
            the public deployment's normal state, not a failure. Neutral card,
            no retry button (retrying cannot succeed), and a pointer to the
            cached scenarios that run with zero API calls. */}
        {status === DraftStatus.ERROR && errorCode === LIVE_MODE_DISABLED && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
              <p className="text-sm font-semibold text-slate-700">
                การวิเคราะห์สด (live analysis) ปิดอยู่บนเดโมสาธารณะ
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              ข่าวนี้ต้องเรียก AI แบบสด ซึ่งปิดไว้เพื่อป้องกันการใช้ API key โดยไม่ได้รับอนุญาต
              ข่าวต่อไปนี้มีผลวิเคราะห์สำรองไว้ (cached demo) และใช้งานได้ครบทุกขั้นตอน:
            </p>
            <ul className="mt-2 space-y-1">
              {CACHED_DEMO_NEWS.map((n) => (
                <li key={n.id} className="text-xs font-medium text-slate-700">
                  • {n.headline}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* The model's answer was cut off at its token budget. Not the user's
            fault and not a bad news item — say so, and offer the retry (a
            shorter answer may fit) rather than the generic failure card. */}
        {status === DraftStatus.ERROR && errorCode === RESPONSE_TRUNCATED && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-sm font-semibold text-amber-800">
              ผลวิเคราะห์ถูกตัดกลางคัน (เกินขีดจำกัดความยาวของโมเดล)
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-700">
              ระบบตรวจพบว่าคำตอบไม่สมบูรณ์จึงไม่นำไปใช้ต่อ — ไม่มีผลวิเคราะห์ที่ไม่ครบถ้วนเข้าสู่ขั้นตอนอนุมัติ
              หากเกิดซ้ำ โปรดแจ้งผู้ดูแลระบบให้ขยายขีดจำกัด (max_tokens)
            </p>
            <button
              onClick={handleAnalyze}
              className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              ลองใหม่อีกครั้ง
            </button>
          </section>
        )}

        {/* Error state */}
        {status === DraftStatus.ERROR &&
          errorCode !== LIVE_MODE_DISABLED &&
          errorCode !== RESPONSE_TRUNCATED && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <p className="text-sm font-semibold text-rose-700">
              การวิเคราะห์ล้มเหลว
            </p>
            <p className="mt-1 break-words text-xs text-rose-600">{error}</p>
            <button
              onClick={handleAnalyze}
              className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
            >
              ลองใหม่อีกครั้ง
            </button>
          </section>
        )}

        {/* Screened out before Agent 1 — not a failure, so it is styled as a
            neutral notice (slate) rather than the rose error card. Naming the
            saved API call is the point: it shows the filter did its job. */}
        {status === DraftStatus.NOT_RELEVANT && relevance && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
              <p className="text-sm font-semibold text-slate-700">
                ข่าวนี้ไม่เกี่ยวข้องกับฐานลูกค้า — ข้ามการวิเคราะห์
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {relevance.reason}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              ไม่มีการเรียก Agent 1 (ประหยัด API call) และไม่มี draft เข้าสู่ขั้นตอนอนุมัติ
            </p>
          </section>
        )}

        {/* Loading state */}
        {isAnalyzing && (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            <p className="text-sm font-medium text-slate-700">
              กำลังประมวลผล… Agent 1 (วิเคราะห์ผลกระทบ) → จับคู่ลูกค้า → Agent 2 (ตรวจสอบข้อเท็จจริง)
            </p>
          </section>
        )}

        {/* Results — pending draft (post Agent 1 + matching + Agent 2) */}
        {draft && status === DraftStatus.PENDING && (
          <ResultsPanel draft={draft} />
        )}
    </div>
  );
}

// ResultsPanel — the money shot. Dark-navy hero leads with the single most
// important number (affected-client count) and the dislocation alert, then
// supporting cards: fact-check verdict and the top-priority call list.
function ResultsPanel({ draft }) {
  const affectedCount = draft.affectedClients.length;
  const dislocated = draft.dislocation.detected;
  // Derived from the draft's own id rather than a prop: useDraft stamps
  // draftId = news.id, and live ids are namespaced (LIVE_ID_PREFIX). Keeps the
  // hook and its Draft shape untouched by live mode.
  const liveSourced = isLiveNewsId(draft.draftId);
  const sentiment = SENTIMENT_META[draft.sentiment] ?? SENTIMENT_META.neutral;
  const factOk = draft.agent2Result?.is_valid;
  const issues = draft.agent2Result?.flagged_issues ?? [];
  const topClients = draft.affectedClients.slice(0, 5);

  return (
    <section className="space-y-4">
      {/* Hero card */}
      <div className="rounded-2xl bg-slate-900 p-6 text-white shadow-lg">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white/5 p-4">
            <p className="text-xs text-slate-400">ลูกค้าที่ได้รับผลกระทบ</p>
            <p className="mt-1 text-4xl font-bold">{affectedCount}</p>
            <p className="mt-1 text-xs text-slate-400">รายที่ควรติดต่อ</p>
          </div>
          <div className="rounded-xl bg-white/5 p-4 sm:col-span-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  dislocated ? "bg-amber-400" : "bg-slate-500"
                }`}
              />
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                {dislocated
                  ? "พบ Dislocation — โอกาสที่ตลาดมองข้าม"
                  : "ไม่พบ Dislocation — ตลาดตอบสนองตามคาด"}
              </p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-100">
              {dislocated
                ? draft.dislocation.description
                : draft.reasoning}
            </p>

            {/* Live items have no companion price data, so "no dislocation" here
                is a limit of the source — not a finding about the market. Say so
                rather than letting an always-negative verdict read as a result. */}
            {liveSourced && (
              <p className="mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
                ข่าวจากแหล่งสดยังไม่รองรับการตรวจจับ Dislocation
                เนื่องจากไม่มีข้อมูลราคาตลาดคู่กัน —
                ฟีเจอร์นี้ใช้ได้เต็มรูปแบบกับ Demo Scenario ที่ผ่านการตรวจสอบแล้ว
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Supporting row: sentiment + fact-check */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">มุมมองต่อพอร์ต (Sentiment)</p>
          <p className={`mt-1 text-lg font-bold ${sentiment.cls}`}>
            {sentiment.label}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {draft.affectedSectors.map((s) => (
              <span
                key={s}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">
            ตรวจสอบข้อเท็จจริง (Agent 2 — Four Eyes)
          </p>
          <p
            className={`mt-1 text-lg font-bold ${
              factOk ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {factOk ? "ผ่านการตรวจสอบ" : "พบประเด็นต้องตรวจ"}
          </p>
          {issues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-700">
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Top-priority call list */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            รายชื่อลูกค้าเรียงตามความสำคัญ (โทรก่อน)
          </h3>
          <span className="text-xs text-slate-400">
            แสดง {topClients.length} จาก {draft.affectedClients.length} ราย
          </span>
        </div>

        {topClients.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-500">ไม่พบลูกค้าที่ได้รับผลกระทบ</p>
            <p className="mt-1 text-xs text-slate-400">
              ข่าวนี้ไม่ตรงกับหุ้นในพอร์ตของลูกค้ารายใด
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {topClients.map((client, i) => {
              const risk = RISK_META[client.riskProfile] ?? {
                label: client.riskProfile,
                cls: "bg-slate-100 text-slate-600",
              };
              // Impact share only — true portfolio exposure, not priorityScore
              // (which includes the Key Account boost). topClients is still
              // ordered by priorityScore; the badge explains any inversion.
              const pct = Math.round(
                calculateImpactShare(client.matchedHoldings) * 100,
              );
              return (
                <li
                  key={client.clientId}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {client.name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${risk.cls}`}
                        >
                          {risk.label}
                        </span>
                        {isKeyAccount(client) && <KeyAccountBadge />}
                        <span className="text-xs text-slate-400">
                          {client.matchedHoldings
                            .map((h) => h.ticker)
                            .join(", ")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">{pct}%</p>
                    <p className="text-[11px] text-slate-400">ของพอร์ต</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
