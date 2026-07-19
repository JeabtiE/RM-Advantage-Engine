// KeyAccountBadge.jsx — the visible disclosure of the Key Account boost.
//
// WHY THIS EXISTS: priorityScore = impact share + 0.15 for clients over the AUM
// bar (see the client-prioritization skill). Ranking uses that score, but the UI
// shows impact share as "% ของพอร์ต" — so a Key Account can legitimately rank
// ABOVE a client with a higher displayed percentage. Without this badge that
// inversion looks like a ranking bug to the CIO reviewing the Four Eyes gate.
// The badge turns a hidden constant into something visible and explainable.
//
// Shared (not duplicated per view like RISK_META) because the label and the
// tooltip wording must stay identical across ClientList / ApprovalDashboard /
// NewsFeed — three hand-copied strings would drift.
//
// "Key Account" is kept in English: it is the industry term the mentor (KKP) and
// the RMs actually use, per CLAUDE.md's rule to prefer industry terms.

import { KEY_ACCOUNT_AUM_THRESHOLD, KEY_ACCOUNT_BOOST } from "../utils/matching.js";

const THRESHOLD_LABEL = `${(KEY_ACCOUNT_AUM_THRESHOLD / 1_000_000).toLocaleString("th-TH")} ล้านบาท`;
const BOOST_LABEL = `+${Math.round(KEY_ACCOUNT_BOOST * 100)}`;

// Derived from the same constants the score uses, so the tooltip can never
// disagree with the actual threshold/boost after a tuning change.
const TOOLTIP =
  `Key Account — AUM ตั้งแต่ ${THRESHOLD_LABEL} ขึ้นไป ` +
  `จึงได้ลำดับความสำคัญ ${BOOST_LABEL} จุด เหนือสัดส่วนพอร์ตที่กระทบ ` +
  `(สัดส่วน % ที่แสดงคือผลกระทบจริง ไม่รวมคะแนนนี้)`;

export default function KeyAccountBadge({ title = TOOLTIP }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white"
    >
      <span aria-hidden="true">★</span>
      Key Account
    </span>
  );
}
