// ClientList.jsx — the full priority-ranked book of affected clients (RM view).
//
// Where ApprovalDashboard shows a compact preview inside the Four Eyes gate,
// this is the RM's working list: EVERY affected client, ranked by priorityScore
// (portfolio exposure + Key Account boost), with the matched holdings broken out
// so the RM knows exactly why each client is on the list before they call. This
// is the concrete payoff of findAffectedClients() + calculatePriority(): "Of 300
// clients, 80 affected — call these 12 first."
//
// TWO DIFFERENT NUMBERS, on purpose: the card's big "% ของพอร์ต" is impact share
// ONLY (a true fact about holdings the RM can defend on the call), while the
// ORDER follows priorityScore, which adds the Key Account boost. The Key Account
// badge is what reconciles them for the reader.
//
// PROPS-DRIVEN BY DESIGN — same pattern as ApprovalDashboard. It reads the
// single draft App owns (via useDraft) and does NOT call useDraft() itself, so
// it stays a pure component and can't desync the pipeline.
//
//   props:
//     draft — the current Draft from useDraft (or null → empty state). Reads
//             draft.affectedClients (each: Client + matchedHoldings + priorityScore).
//
// Design language per CLAUDE.md: light page, rounded white cards, risk badges
// reusing the same color mapping as ApprovalDashboard for consistency. Thai UI.

import { calculateImpactShare, isKeyAccount } from "../utils/matching.js";
import KeyAccountBadge from "./KeyAccountBadge.jsx";

// Risk-profile badge colors — kept identical to ApprovalDashboard's RISK_META
// so a given profile always reads the same color across the app.
const RISK_META = {
  conservative: { label: "ระมัดระวัง", cls: "bg-emerald-50 text-emerald-700" },
  moderate: { label: "ปานกลาง", cls: "bg-amber-50 text-amber-700" },
  aggressive: { label: "เชิงรุก", cls: "bg-rose-50 text-rose-700" },
};

export default function ClientList({ draft }) {
  // Empty state — no draft yet, or a draft that matched nobody. Both land here
  // so the RM never sees a bare/broken list. (draft?.affectedClients handles
  // the null draft; the .length check handles an analyzed-but-no-match result.)
  const clients = draft?.affectedClients ?? [];
  if (clients.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-600">
          ยังไม่มีลูกค้าที่ได้รับผลกระทบ
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {draft
            ? "ข่าวนี้ไม่กระทบพอร์ตของลูกค้ารายใด ลองเลือกข่าวอื่น"
            : "เลือกและวิเคราะห์ข่าวก่อน แล้วรายชื่อลูกค้าที่ต้องติดต่อจะปรากฏที่นี่"}
        </p>
      </section>
    );
  }

  // Rank by priorityScore (impact share + Key Account boost) — NOT by the
  // displayed percentage, which is impact share alone. A Key Account can
  // therefore sit above a client with higher displayed exposure; the Key Account
  // badge on the card is what explains that inversion to the RM/CIO.
  // affectedClients arrives sorted already, but a copy-then-sort here keeps this
  // view correct on its own regardless of source order (never mutate the prop
  // array — copy first).
  const ranked = [...clients].sort(
    (a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
  );

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">ลูกค้าที่กระทบ</h2>
          {/* Must describe the ACTUAL sort (priorityScore), not the displayed %.
              The old copy said "เรียงตามสัดส่วนพอร์ต" — now false, and the list
              visibly contradicts it wherever a Key Account outranks a client
              with higher exposure. */}
          <p className="text-xs text-slate-500">
            เรียงตามความสำคัญ (สัดส่วนพอร์ตที่กระทบ + Key Account) — โทรหารายบนสุดก่อน
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {ranked.length} ราย
        </span>
      </div>

      {/* Ranked list — one card per client */}
      <ul className="space-y-3">
        {ranked.map((client, i) => (
          <ClientCard key={client.clientId} client={client} rank={i + 1} />
        ))}
      </ul>
    </section>
  );
}

// ClientCard — a single ranked client: rank chip, name + risk badge, the % of
// portfolio actually affected, and the matched holdings that put them on the
// list, each with its own weight.
function ClientCard({ client, rank }) {
  const risk = RISK_META[client.riskProfile] ?? {
    label: client.riskProfile,
    cls: "bg-slate-100 text-slate-600",
  };
  const matched = client.matchedHoldings ?? [];
  // The displayed % is impact share ONLY — a true, auditable fact about this
  // client's holdings that the RM can defend on the call. It is deliberately not
  // priorityScore: that carries the Key Account boost, so showing it here would
  // overstate real exposure (C001 on N006: 80% actual, 0.95 score) and could
  // even read >100%. The boost's effect on ORDER is disclosed by the badge below.
  const pct = Math.round(calculateImpactShare(matched) * 100);
  const keyAccount = isKeyAccount(client);

  // Key Account rows get a navy left rail — a live-scroll anchor the presenter
  // can point to without hunting for the badge. Purely visual: ranking, the
  // displayed %, and badge logic are untouched.
  //
  // A background TINT is deliberately not used here: the page itself is
  // bg-slate-50, so tinting a white card toward slate-50 would sink it into the
  // page and read as "faded/disabled" — the opposite of the intent. The rail
  // works against any background. (ApprovalDashboard's rows sit inside a white
  // card, so a tint reads correctly there and it uses both.)
  return (
    <li
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${
        keyAccount ? "border-l-4 border-l-slate-900" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
            {rank}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {client.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${risk.cls}`}
              >
                {risk.label}
              </span>
              {/* Key Account badge — dark chip per the design language's use of
                  navy for emphasis. This is what makes the boost explainable:
                  without it, a Key Account outranking a higher-exposure client
                  looks like a bug to the CIO. */}
              {keyAccount && <KeyAccountBadge />}
            </div>
          </div>
        </div>
        {/* Exposure — big and right-aligned, the RM's at-a-glance signal */}
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">{pct}%</p>
          <p className="text-[11px] text-slate-400">ของพอร์ต</p>
        </div>
      </div>

      {/* Matched holdings — the "why they're here". Each shows the holding's own
          weight within the client's portfolio so the RM can see which position
          drives the exposure. */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="mb-2 text-[11px] font-semibold text-slate-500">
          หลักทรัพย์ที่ได้รับผลกระทบ
        </p>
        <div className="flex flex-wrap gap-2">
          {matched.map((h) => (
            <span
              key={h.ticker}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1 text-xs"
            >
              <span className="font-semibold text-slate-800">{h.ticker}</span>
              <span className="text-slate-400">{h.name}</span>
              <span className="font-medium text-slate-500">
                {Math.round((h.weight ?? 0) * 100)}%
              </span>
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}
