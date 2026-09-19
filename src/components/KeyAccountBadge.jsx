// KeyAccountBadge.jsx — the visible disclosure of the Key Account boost.
//
// WHY THIS EXISTS: priorityScore = impact share + 0.15 for clients over the AUM
// bar (see the client-prioritization skill). Ranking uses that score, but the UI
// shows impact share as "% of portfolio" — so a Key Account can legitimately rank
// ABOVE a client with a higher displayed percentage. Without this badge that
// inversion looks like a ranking bug to the CIO reviewing the Four Eyes gate.
// The badge turns a hidden constant into something visible and explainable.
//
// Shared (not duplicated per view like RISK_META) because the label and the
// tooltip wording must stay identical across ClientList / ApprovalDashboard /
// NewsRail — three hand-copied strings would drift.
//
// "Key Account" is kept in English: it is the industry term the mentor (KKP) and
// the RMs actually use, per CLAUDE.md's rule to prefer industry terms.
//
// Phase 6: a small OUTLINED tag, not a filled navy chip. A filled badge was the
// single loudest element in a client row and pulled attention off the number the
// row exists to show; the outline states the tier without competing.

import {
  KEY_ACCOUNT_AUM_THRESHOLD,
  KEY_ACCOUNT_BOOST,
} from "../utils/matching.js";
import { Tag } from "./ui.jsx";

const THRESHOLD_LABEL = `THB ${(KEY_ACCOUNT_AUM_THRESHOLD / 1_000_000).toLocaleString("en-GB")}m`;
const BOOST_LABEL = `+${Math.round(KEY_ACCOUNT_BOOST * 100)}`;

// Derived from the same constants the score uses, so the tooltip can never
// disagree with the actual threshold/boost after a tuning change.
const TOOLTIP =
  `Key Account — AUM of ${THRESHOLD_LABEL} or more, so priority is boosted ` +
  `by ${BOOST_LABEL} points above the affected portfolio share ` +
  `(the % shown is real exposure and excludes this boost)`;

export default function KeyAccountBadge({ title = TOOLTIP }) {
  return (
    <Tag tone="alert" title={title}>
      Key Account
    </Tag>
  );
}
