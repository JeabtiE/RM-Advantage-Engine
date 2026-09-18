// ApprovalDashboard.jsx — the Four Eyes approval gate (CIO / investment-expert
// persona). This is the legal safety mechanism: NOTHING (Agent 3 scripts, client
// contact) happens until a human approves here. See CLAUDE.md hard constraint #1.
//
// PROPS-DRIVEN BY DESIGN. It consumes the pending draft that useDraft() builds
// but does NOT call useDraft() itself — App will own the single draft instance
// and pass these three props in (see CLAUDE.md → Implementation Notes → state-
// lifting plan). Keeping it a pure component lets it be reviewed in isolation now
// and drop straight into the lifted-state wiring next step, unchanged.
//
//   props:
//     draft      — the pending Draft from useDraft (or null → empty state)
//     onApprove  — (reviewedBy: string) => void   (wires to useDraft.approve)
//     onReject   — (reviewedBy: string) => void   (wires to useDraft.reject)
//
// ROADMAP (deliberate MVP scope cut, not a missed requirement): CLAUDE.md notes
// the CIO "can edit, approve, or reject." Inline editing (an onEdit prop feeding
// a draft mutation back into useDraft) is intentionally deferred past the
// hackathon MVP — approve/reject exercises the Four Eyes gate end-to-end, which
// is what the demo must prove. Add onEdit when editing becomes a real need.
//
// Design language per CLAUDE.md: light page, dark-navy hero for the decision-
// critical signal, rounded white cards, black primary (approve) button. Thai UI.

import { useState } from "react";
import { DraftStatus } from "../hooks/useDraft.js";
import { calculateImpactShare, isKeyAccount } from "../utils/matching.js";
import KeyAccountBadge from "./KeyAccountBadge.jsx";

// CIO identity stamped onto the audit trail on approve/reject. A single reviewer
// for the demo; a real deployment would read this from the logged-in user.
const REVIEWER = "CIO";

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

// event_scope → Thai label + a one-line hint on hover (how widely clients match).
const SCOPE_META = {
  systemic: { label: "ทั้งตลาด (systemic)", hint: "ข่าวมหภาค — ขยายผลไปยัง sector อื่นได้" },
  sector: { label: "รายอุตสาหกรรม (sector)", hint: "ข่าวของอุตสาหกรรมเดียว" },
  single_company: {
    label: "รายบริษัท (single company)",
    hint: "จับคู่เฉพาะลูกค้าที่ถือหุ้นตัวนี้ — ไม่ขยายไปทั้ง sector",
  },
};

// Per-sector / per-holding direction. Green up / red down per the design
// language's financial colors; neutral stays slate.
const DIRECTION_META = {
  positive: { arrow: "▲", label: "เชิงบวก", pill: "bg-emerald-50 text-emerald-700", text: "text-emerald-600" },
  negative: { arrow: "▼", label: "เชิงลบ", pill: "bg-rose-50 text-rose-700", text: "text-rose-600" },
  neutral: { arrow: "•", label: "เป็นกลาง", pill: "bg-slate-100 text-slate-600", text: "text-slate-400" },
};

export default function ApprovalDashboard({ draft, onApprove, onReject }) {
  // Collapse long source news by default so the priority list and the
  // approve/reject buttons stay reachable without heavy scrolling mid-demo.
  // (Declared before the early return — hooks must run unconditionally.)
  const [newsExpanded, setNewsExpanded] = useState(false);

  // Empty state — no draft to review yet (before analysis, or after reset).
  if (!draft) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">
          ยังไม่มีร่างที่รอการอนุมัติ
        </p>
        <p className="mt-1 text-xs text-slate-400">
          เลือกและวิเคราะห์ข่าวก่อน แล้วผลจะปรากฏที่นี่เพื่อให้ CIO ตรวจสอบ
        </p>
      </section>
    );
  }

  const dislocated = draft.dislocation?.detected;
  const sentiment = SENTIMENT_META[draft.sentiment] ?? SENTIMENT_META.neutral;
  const factOk = draft.agent2Result?.is_valid;
  const issues = draft.agent2Result?.flagged_issues ?? [];
  const adjusted = draft.agent2Result?.adjusted_reasoning;
  const factNotes = Array.isArray(draft.agent2Result?.factcheck_normalization_notes)
    ? draft.agent2Result.factcheck_normalization_notes
    : [];
  const clients = draft.affectedClients ?? [];
  // Phase 3 Agent 1 fields — read from the raw analysis the draft keeps. Cached
  // runs predate them, so each piece renders only when present.
  const analysis = draft.analysis ?? {};
  const scope = SCOPE_META[analysis.event_scope];
  const sectorImpacts = Array.isArray(analysis.sector_impacts)
    ? analysis.sector_impacts
    : [];
  const impactSectors = new Set(sectorImpacts.map((s) => s.sector));
  // Sectors with no explicit impact keep the plain pill (cached runs: all of them).
  const plainSectors = (draft.affectedSectors ?? []).filter(
    (s) => !impactSectors.has(s),
  );
  const notes = Array.isArray(analysis.normalization_notes)
    ? analysis.normalization_notes
    : [];
  // Only cached, CIO-reviewed scenarios carry this; live drafts never do.
  const cioChanges = Array.isArray(draft.cioReview?.changes)
    ? draft.cioReview.changes
    : [];
  const isPending = draft.status === DraftStatus.PENDING;
  const isApproved = draft.status === DraftStatus.APPROVED;
  const isRejected = draft.status === DraftStatus.REJECTED;
  // Approved, but Agent 3 threw. The approval itself still stands, so this view
  // keeps showing the decision + audit trail rather than reverting to the gate.
  const isScriptError = draft.status === DraftStatus.SCRIPT_ERROR;

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            การอนุมัติแบบ Four Eyes
          </h2>
          <p className="text-xs text-slate-500">
            CIO ตรวจสอบเหตุผล ผลตรวจข้อเท็จจริง และรายชื่อลูกค้า ก่อนอนุมัติ
          </p>
        </div>
        <StatusBadge status={draft.status} />
      </div>

      {/* Hero — the decision-critical signal the CIO judges on */}
      <div className="rounded-2xl bg-slate-900 p-6 text-white shadow-lg">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white/5 p-4">
            <p className="text-xs text-slate-400">ลูกค้าที่ได้รับผลกระทบ</p>
            <p className="mt-1 text-4xl font-bold">{clients.length}</p>
            <p className="mt-1 text-xs text-slate-400">รายที่จะได้รับสคริปต์</p>
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
              {dislocated ? draft.dislocation.description : draft.reasoning}
            </p>
            {cioChanges.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-300">
                ฉบับที่ CIO ตรวจแก้แล้ว — ดูต้นฉบับจาก AI ในส่วน “แก้ไขโดย CIO”
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Human CIO review recorded in the cache (src/data/cioReviews/*.json).
          Every change shows the ORIGINAL AI text next to the edit and the
          rationale, so nothing the AI wrote disappears from view. */}
      {cioChanges.length > 0 && (
        <CioReviewPanel review={draft.cioReview} changes={cioChanges} />
      )}

      {/* Source news — what the analysis is grounded in. Collapsed to ~150
          chars by default (simple slice + boolean, no library) so the demo
          keeps the decision controls above the fold. */}
      <SourceNews
        headline={draft.newsSource?.headline}
        content={draft.newsSource?.content ?? ""}
        expanded={newsExpanded}
        onToggle={() => setNewsExpanded((v) => !v)}
      />

      {/* Two-up: Agent 1 analysis + Agent 2 fact-check */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">
            การวิเคราะห์ (Agent 1)
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Sentiment:</span>
            <span className={`text-sm font-bold ${sentiment.cls}`}>
              {sentiment.label}
            </span>
            {scope && (
              <span
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                title={scope.hint}
              >
                ขอบเขต: {scope.label}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            {draft.reasoning}
          </p>
          {/* Per-sector direction + reason when Agent 1 supplied them. Neutral
              sectors are listed but, by server rule, do not select clients —
              the label says so, since they are absent from affectedSectors. */}
          {sectorImpacts.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {sectorImpacts.map((s) => {
                const dir = DIRECTION_META[s.direction] ?? DIRECTION_META.neutral;
                return (
                  <li key={s.sector} className="text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 ${dir.pill}`} title={dir.label}>
                        {dir.arrow} {s.sector}
                      </span>
                      {s.direction === "neutral" && (
                        <span className="text-[11px] text-slate-400">
                          เป็นกลาง — ไม่ใช้จับคู่ลูกค้า
                        </span>
                      )}
                    </div>
                    {s.reason && (
                      <p className="mt-0.5 pl-2.5 leading-relaxed text-slate-500">
                        {s.reason}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {plainSectors.map((s) => (
              <span
                key={s}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
              >
                {s}
              </span>
            ))}
            {(draft.affectedTickers ?? []).map((t) => (
              <span
                key={t}
                className="rounded-full bg-slate-900/5 px-2.5 py-0.5 text-xs font-medium text-slate-700"
              >
                {t}
              </span>
            ))}
          </div>
          {/* Server-side consistency fixes to Agent 1's output. Shown so the
              CIO approves what the matcher actually used, not a silent edit. */}
          {notes.length > 0 && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-semibold text-slate-600">
                ระบบปรับผลวิเคราะห์อัตโนมัติ (normalization)
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-500">
                {notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-500">
            ตรวจสอบข้อเท็จจริง (Agent 2)
          </p>
          {cioChanges.length > 0 && (
            <p className="mt-1 text-[11px] text-slate-400">
              ผลตรวจนี้เป็นของต้นฉบับจาก AI (ก่อน CIO แก้ไข)
            </p>
          )}
          <p
            className={`mt-2 text-sm font-bold ${
              factOk ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {factOk ? "ผ่านการตรวจสอบ — ไม่พบประเด็น" : "พบประเด็นที่ต้องพิจารณา"}
          </p>
          {issues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-700">
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
          {/* Show the corrected reasoning only when it differs from Agent 1's —
              that's the version Agent 3 will actually use if approved. */}
          {adjusted && adjusted !== draft.reasoning && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <p className="text-[11px] font-semibold text-amber-700">
                เหตุผลฉบับปรับแก้ (จะใช้สร้างสคริปต์)
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                {adjusted}
              </p>
            </div>
          )}
          {/* Server guard corrections (e.g. is_valid re-derived from the issue
              list). Absent on cached runs and on consistent responses. */}
          {factNotes.length > 0 && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <p className="text-[11px] font-semibold text-slate-600">
                ระบบปรับผลตรวจสอบอัตโนมัติ (normalization)
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-500">
                {factNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Affected clients — who gets contacted if approved */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            ลูกค้าที่จะได้รับสคริปต์ (เรียงตามความสำคัญ)
          </h3>
          <span className="text-xs text-slate-400">{clients.length} ราย</span>
        </div>
        {clients.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-500">ไม่มีลูกค้าที่ได้รับผลกระทบ</p>
            <p className="mt-1 text-xs text-slate-400">
              การอนุมัติจะไม่สร้างสคริปต์ให้ลูกค้ารายใด
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {clients.map((client, i) => {
              const risk = RISK_META[client.riskProfile] ?? {
                label: client.riskProfile,
                cls: "bg-slate-100 text-slate-600",
              };
              // Impact share only — the true exposure fact the CIO is approving.
              // NOT priorityScore (which adds the Key Account boost and would
              // overstate the portfolio percentage). Order still follows
              // priorityScore; the badge explains any resulting inversion.
              const pct = Math.round(
                calculateImpactShare(client.matchedHoldings ?? []) * 100,
              );
              // Key Account rows: faint tint + navy left rail, so the CIO (and
              // the presenter mid-scroll) can spot the tier at a glance. These
              // rows sit inside a WHITE card, so slate-50 reads as a distinct
              // band here — unlike ClientList, whose cards sit on a slate-50
              // page and use the rail alone. Visual only; ranking and badge
              // logic unchanged.
              const keyAccount = isKeyAccount(client);
              return (
                <li
                  key={client.clientId}
                  className={`flex items-center justify-between gap-3 py-3 ${
                    keyAccount
                      ? "-mx-2 rounded-lg border-l-4 border-l-slate-900 bg-slate-50 px-2"
                      : ""
                  }`}
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
                        {keyAccount && <KeyAccountBadge />}
                        <span className="text-xs text-slate-400">
                          {(client.matchedHoldings ?? []).map((h, j) => {
                            const dir = DIRECTION_META[h.direction];
                            return (
                              <span key={h.ticker}>
                                {j > 0 && ", "}
                                {h.ticker}
                                {dir && (
                                  <span className={dir.text} title={dir.label}>
                                    {dir.arrow}
                                  </span>
                                )}
                              </span>
                            );
                          })}
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

      {/* Action bar — the gate itself. Buttons only while pending. */}
      {isPending && (
        <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
          <button
            onClick={() => onReject?.(REVIEWER)}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            ปฏิเสธ (Reject)
          </button>
          <button
            onClick={() => onApprove?.(REVIEWER)}
            className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            อนุมัติ (Approve)
          </button>
        </div>
      )}

      {/* Post-decision confirmation — replaces the buttons once decided */}
      {(isApproved || isRejected || isScriptError) && (
        <div
          className={`rounded-2xl border p-4 ${
            isApproved
              ? "border-emerald-200 bg-emerald-50"
              : isScriptError
                ? "border-rose-200 bg-rose-50"
                : "border-slate-200 bg-slate-50"
          }`}
        >
          <p
            className={`text-sm font-semibold ${
              isApproved
                ? "text-emerald-700"
                : isScriptError
                  ? "text-rose-700"
                  : "text-slate-600"
            }`}
          >
            {isApproved
              ? "อนุมัติแล้ว — กำลังสร้างสคริปต์สำหรับลูกค้า"
              : isScriptError
                ? "อนุมัติแล้ว — แต่สร้างสคริปต์ไม่สำเร็จ (ดูแท็บสคริปต์เพื่อลองใหม่)"
                : "ปฏิเสธแล้ว — จะไม่มีการสร้างสคริปต์หรือติดต่อลูกค้า"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            ตรวจสอบโดย {draft.reviewedBy ?? REVIEWER}
            {draft.approvedAt
              ? ` · ${new Date(draft.approvedAt).toLocaleString("th-TH")}`
              : ""}
          </p>
        </div>
      )}
    </section>
  );
}

// Thai labels for the review paths the CIO may edit (see src/utils/cioReview.js).
function cioPathLabel(path) {
  const top = {
    reasoning: "เหตุผล (reasoning)",
    sentiment: "Sentiment",
    dislocation_description: "คำอธิบาย Dislocation",
  }[path];
  if (top) return top;
  const m = /^sector_impacts\[(.+)\]\.(direction|reason)$/.exec(path ?? "");
  if (m) return `${m[1]} — ${m[2] === "direction" ? "ทิศทาง" : "เหตุผลรายกลุ่ม"}`;
  return path;
}

// CioReviewPanel — "แก้ไขโดย CIO": who reviewed, and for each change the
// original AI text (before), the CIO's version (after) and the rationale.
function CioReviewPanel({ review, changes }) {
  const reviewedAt = review?.reviewedAt ? new Date(review.reviewedAt) : null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">แก้ไขโดย CIO</p>
        <p className="text-xs text-slate-500">
          {review?.reviewer}
          {reviewedAt && !Number.isNaN(reviewedAt.getTime())
            ? ` · ${reviewedAt.toLocaleString("th-TH")}`
            : ""}
        </p>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        รายชื่อลูกค้าและสคริปต์ด้านล่างใช้ฉบับที่แก้ไขแล้ว — ต้นฉบับจาก AI แสดงไว้ในแต่ละรายการ
      </p>
      <ul className="mt-3 space-y-3">
        {changes.map((c) => (
          <li key={c.path} className="rounded-xl bg-slate-50 p-3 text-xs">
            <p className="font-semibold text-slate-700">{cioPathLabel(c.path)}</p>
            {/* Both versions stay plain and fully readable — no strikethrough:
                the CIO is reviewing wording, and struck-through Thai is hard to
                read on a screen the presenter is talking over. */}
            <p className="mt-1.5 text-[11px] font-medium text-slate-400">ข้อความเดิมจาก AI</p>
            <p className="leading-relaxed text-slate-500">{c.before}</p>
            <p className="mt-1.5 text-[11px] font-medium text-emerald-600">ข้อความหลัง CIO แก้ไข</p>
            <p className="leading-relaxed text-slate-800">{c.after}</p>
            <p className="mt-1.5 text-[11px] font-medium text-slate-400">เหตุผลของ CIO</p>
            <p className="leading-relaxed text-slate-600">{c.rationale}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// SourceNews — headline + collapsible body. Shows the first ~150 chars with an
// "อ่านเพิ่มเติม" toggle when the content is longer; expands to full text.
const PREVIEW_CHARS = 150;
function SourceNews({ headline, content, expanded, onToggle }) {
  const isLong = content.length > PREVIEW_CHARS;
  const shown = expanded || !isLong ? content : `${content.slice(0, PREVIEW_CHARS)}…`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">ข่าวต้นทาง (Source)</p>
      <h3 className="mt-1 text-sm font-semibold text-slate-900">{headline}</h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{shown}</p>
      {isLong && (
        <button
          onClick={onToggle}
          className="mt-2 text-xs font-semibold text-slate-900 underline-offset-2 hover:underline"
        >
          {expanded ? "ย่อ" : "อ่านเพิ่มเติม"}
        </button>
      )}
    </div>
  );
}

// StatusBadge — small pill mirroring the draft's machine state, top-right.
function StatusBadge({ status }) {
  const meta = {
    [DraftStatus.PENDING]: { label: "รออนุมัติ", cls: "bg-amber-100 text-amber-700" },
    [DraftStatus.APPROVED]: { label: "อนุมัติแล้ว", cls: "bg-emerald-100 text-emerald-700" },
    [DraftStatus.REJECTED]: { label: "ปฏิเสธ", cls: "bg-slate-200 text-slate-600" },
    [DraftStatus.SCRIPT_ERROR]: {
      label: "อนุมัติแล้ว · สคริปต์ล้มเหลว",
      cls: "bg-rose-100 text-rose-700",
    },
  }[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
