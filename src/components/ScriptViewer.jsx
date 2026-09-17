// ScriptViewer.jsx — the RM-facing phone scripts (Agent 3 output).
//
// This view is the visual half of the Four Eyes gate: scripts simply DO NOT
// exist until a human approves the draft (useDraft only calls Agent 3 inside
// approve()). So this component gates on draft.status === "approved" and shows
// nothing script-like before that — the gate is enforced in the UI, not just in
// the pipeline. Before approval the RM sees a pending message, never a draft
// script they might read to a client prematurely.
//
// PROPS-DRIVEN BY DESIGN — same pattern as ApprovalDashboard / ClientList; no
// useDraft() call here. It needs TWO pieces of the hook because scripts live in
// their own state, separate from the draft:
//
//   props:
//     draft   — the current Draft (or null). Read for status gating + reviewer.
//     scripts — Agent 3 output array (or null until generated). Each entry:
//               { clientId, name, riskProfile, ok, script? , error? }.
//               null while status is "approved" but the batch is still running.
//     onRetry — () => void. Re-runs ONLY Agent 3 after a script_error (wires to
//               useDraft.retryScripts). The approval is NOT re-opened.
//
// Design language per CLAUDE.md: light page, rounded white cards, risk badges
// reusing the same color mapping as the other views. Thai UI.

import { useState } from "react";
import { DraftStatus } from "../hooks/useDraft.js";

// Risk-profile badge colors — identical to ApprovalDashboard / ClientList so a
// profile reads the same color everywhere.
const RISK_META = {
  conservative: { label: "ระมัดระวัง", cls: "bg-emerald-50 text-emerald-700" },
  moderate: { label: "ปานกลาง", cls: "bg-amber-50 text-amber-700" },
  aggressive: { label: "เชิงรุก", cls: "bg-rose-50 text-rose-700" },
};

export default function ScriptViewer({ draft, scripts, onRetry }) {
  const approved = draft?.status === DraftStatus.APPROVED;
  const scriptError = draft?.status === DraftStatus.SCRIPT_ERROR;

  // The Agent 3 batch threw for an approved draft. Checked BEFORE the loading
  // branch below: scripts stays null on this path, so without this the view
  // would show "generating…" forever with the error stranded on another tab.
  // The draft is still approved, so retry re-runs Agent 3 only.
  if (scriptError) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-rose-700">
          สร้างสคริปต์ไม่สำเร็จ
        </p>
        <p className="mt-1 text-xs text-rose-600">
          ร่างนี้ได้รับการอนุมัติแล้ว — ระบบสร้างสคริปต์ไม่สำเร็จ ลองใหม่ได้โดยไม่ต้องอนุมัติซ้ำ
        </p>
        {draft.scriptError && (
          <p className="mx-auto mt-3 max-w-xl break-words rounded-lg bg-white/70 p-3 text-left text-[11px] text-rose-700">
            {draft.scriptError}
          </p>
        )}
        <button
          onClick={() => onRetry?.()}
          className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700"
        >
          ลองสร้างสคริปต์ใหม่
        </button>
      </section>
    );
  }

  // GATE: no scripts before Four Eyes approval. Covers null draft, analyzing,
  // pending, and rejected alike — none of them have client-facing scripts, and
  // showing one would defeat the whole point of the approval step.
  if (!approved) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">
          สคริปต์จะปรากฏหลังจากผู้เชี่ยวชาญอนุมัติ
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {draft?.status === DraftStatus.REJECTED
            ? "ร่างนี้ถูกปฏิเสธ — จะไม่มีการสร้างสคริปต์สำหรับลูกค้า"
            : "ระบบจะสร้างสคริปต์รายลูกค้าเมื่อผ่านการอนุมัติแบบ Four Eyes เท่านั้น"}
        </p>
      </section>
    );
  }

  // Approved, but Agent 3 hasn't returned yet (approve() flips status before the
  // async batch resolves). Show a loading state so the demo doesn't look empty
  // in that window instead of a bare list.
  if (!scripts) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">กำลังสร้างสคริปต์…</p>
        <p className="mt-1 text-xs text-slate-400">
          อนุมัติแล้ว — ระบบกำลังสร้างสคริปต์รายลูกค้า
        </p>
      </section>
    );
  }

  // Approved, but nobody was affected — generateAllScripts([]) returns []. Show a
  // real empty state instead of a "0 สคริปต์" header over a bare list. (Mirrors
  // the zero-affected empty states in ClientList / ApprovalDashboard.)
  if (scripts.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">
          ไม่มีสคริปต์ที่ต้องสร้าง
        </p>
        <p className="mt-1 text-xs text-slate-400">
          ข่าวนี้ไม่กระทบพอร์ตของลูกค้ารายใด จึงไม่มีสคริปต์สำหรับติดต่อ
        </p>
      </section>
    );
  }

  const okCount = scripts.filter((s) => s.ok).length;
  const failedCount = scripts.length - okCount;

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">สคริปต์รายลูกค้า</h2>
          <p className="text-xs text-slate-500">
            อนุมัติโดย {draft.reviewedBy ?? "CIO"} — พร้อมให้ RM โทรหาลูกค้า
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          {okCount} สคริปต์
        </span>
      </div>

      {/* Rare: one or more clients' Agent 3 calls failed. allSettled means the
          batch still returned — surface the count so nobody assumes a missing
          script means "no insight for this client". */}
      {failedCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-700">
            สร้างสคริปต์ไม่สำเร็จ {failedCount} ราย — ลองอนุมัติใหม่อีกครั้ง
          </p>
        </div>
      )}

      {/* One card per client */}
      <ul className="space-y-3">
        {scripts.map((s) => (
          <ScriptCard key={s.clientId} entry={s} />
        ))}
      </ul>
    </section>
  );
}

// ScriptCard — one client's script: name + risk badge, the script body, and a
// copy button (the RM reads this on a call, so one-tap copy matters). Failed
// entries show the error instead of a script.
function ScriptCard({ entry }) {
  const [copied, setCopied] = useState(false);
  const risk = RISK_META[entry.riskProfile] ?? {
    label: entry.riskProfile,
    cls: "bg-slate-100 text-slate-600",
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(entry.script ?? "");
      setCopied(true);
      // Brief confirmation, then revert so the button is reusable across clients.
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (permissions / insecure context). Non-fatal —
      // the script text is on screen to read regardless, so just skip feedback.
    }
  };

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{entry.name}</p>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${risk.cls}`}
          >
            {risk.label}
          </span>
        </div>
        {entry.ok && (
          <button
            onClick={onCopy}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
          </button>
        )}
      </div>

      {entry.ok ? (
        <>
          <p className="mt-3 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
            {entry.script}
          </p>
          {/* Server flagged it as over the character budget (the proxy for the
              3-sentence rule). Shown in full — never truncated — so the RM can
              shorten it on the call without losing a caveat. */}
          {entry.length_exceeded && (
            <p className="mt-2 text-[11px] text-amber-600">
              สคริปต์ยาวเกินกำหนด ({entry.script?.length ?? 0} ตัวอักษร) — โปรดตัดให้กระชับก่อนใช้
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
          สร้างสคริปต์ไม่สำเร็จ: {entry.error}
        </p>
      )}
    </li>
  );
}
