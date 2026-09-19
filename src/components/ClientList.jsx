// ClientList.jsx — the full priority-ranked book of affected clients (RM view).
//
// Where ApprovalDashboard shows a compact preview inside the Four Eyes gate,
// this is the RM's working list: EVERY affected client, ranked by priorityScore
// (portfolio exposure + Key Account boost), with the matched holdings broken out
// so the RM knows exactly why each client is on the list before they call. This
// is the concrete payoff of findAffectedClients() + calculatePriority(): "Of 300
// clients, 80 affected — call these 12 first."
//
// TWO DIFFERENT NUMBERS, on purpose: the row's big "% of portfolio" is impact share
// ONLY (a true fact about holdings the RM can defend on the call), while the
// ORDER follows priorityScore, which adds the Key Account boost. The Key Account
// tag is what reconciles them for the reader.
//
// PROPS-DRIVEN BY DESIGN — same pattern as ApprovalDashboard. It reads the
// single draft App owns (via useDraft) and does NOT call useDraft() itself, so
// it stays a pure component and can't desync the pipeline.
//
//   props:
//     draft — the current Draft from useDraft (or null → empty state). Reads
//             draft.affectedClients (each: Client + matchedHoldings + priorityScore).
//
// Phase 6: one card per client became one ROW per client, hairline-separated.
// Ten bordered, shadowed cards made a ten-client book scroll for two screens
// and buried the percentages; rows put every number in one alignable column.
// The matched holdings sit on a secondary line inside the row rather than in a
// bordered sub-panel.

import { calculateImpactShare, isKeyAccount } from "../utils/matching.js";
import KeyAccountBadge from "./KeyAccountBadge.jsx";
import {
  DIRECTION_META,
  EmptyState,
  Pct,
  Rank,
  Row,
  Rows,
  Section,
  riskLabel,
  toneClass,
} from "./ui.jsx";

export default function ClientList({ draft }) {
  // Empty state — no draft yet, or a draft that matched nobody. Both land here
  // so the RM never sees a bare/broken list. (draft?.affectedClients handles
  // the null draft; the .length check handles an analyzed-but-no-match result.)
  const clients = draft?.affectedClients ?? [];
  if (clients.length === 0) {
    return (
      <EmptyState
        title="No affected clients"
        hint={
          draft
            ? "This item doesn't touch any client portfolio. Try another news item."
            : "Select a news item and analyze it — the clients to call appear here."
        }
      />
    );
  }

  // Rank by priorityScore (impact share + Key Account boost) — NOT by the
  // displayed percentage, which is impact share alone. A Key Account can
  // therefore sit above a client with higher displayed exposure; the Key Account
  // tag on the row is what explains that inversion to the RM/CIO.
  // affectedClients arrives sorted already, but a copy-then-sort here keeps this
  // view correct on its own regardless of source order (never mutate the prop
  // array — copy first).
  const ranked = [...clients].sort(
    (a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0),
  );

  return (
    <Section
      title="Affected clients"
      /* Must describe the ACTUAL sort (priorityScore), not the displayed %.
         The old copy said "sorted by portfolio share" — now false, and the list
         visibly contradicts it wherever a Key Account outranks a client
         with higher exposure. */
      meta="By priority (affected portfolio share + Key Account) — call the top rows first"
      action={
        <span className="tnum shrink-0 text-caption text-text-3">
          {ranked.length}
        </span>
      }
    >
      <Rows>
        {ranked.map((client, i) => (
          <Row key={client.clientId}>
            <ClientListRow client={client} rank={i + 1} />
          </Row>
        ))}
      </Rows>
    </Section>
  );
}

// ClientListRow — a single ranked client: dim rank, name + risk + Key Account
// tag, the % of portfolio actually affected right-aligned in tabular figures,
// and the matched holdings (with each one's weight) on a second line.
function ClientListRow({ client, rank }) {
  const matched = client.matchedHoldings ?? [];
  // The displayed % is impact share ONLY — a true, auditable fact about this
  // client's holdings that the RM can defend on the call. It is deliberately not
  // priorityScore: that carries the Key Account boost, so showing it here would
  // overstate real exposure (C001 on N006: 80% actual, 0.95 score) and could
  // even read >100%. The boost's effect on ORDER is disclosed by the tag below.
  const pct = Math.round(calculateImpactShare(matched) * 100);
  const keyAccount = isKeyAccount(client);

  // Key Account rows get a left rail — a live-scroll anchor the presenter can
  // point to without hunting for the tag. Purely visual: ranking, the displayed
  // %, and tag logic are untouched.
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="pt-0.5">
        <Rank n={rank} />
      </span>
      <div
        className={`min-w-0 flex-1 ${keyAccount ? "border-l-2 border-alert pl-3" : ""}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-body font-medium text-text">
              {client.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-caption text-text-3">
                {riskLabel(client.riskProfile)}
              </span>
              {/* Key Account tag — what makes the boost explainable: without
                  it, a Key Account outranking a higher-exposure client looks
                  like a bug to the CIO. */}
              {keyAccount && <KeyAccountBadge />}
            </div>
          </div>
          <Pct value={pct} />
        </div>

        {/* Matched holdings — the "why they're here". Each shows the holding's
            own weight within the client's portfolio so the RM can see which
            position drives the exposure, and its expected direction where
            matching tagged one. */}
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {matched.map((h) => {
            const d = DIRECTION_META[h.direction];
            return (
              <li
                key={h.ticker}
                className="flex items-baseline gap-1.5 text-caption"
              >
                <span className="font-semibold text-text-2">{h.ticker}</span>
                {d && (
                  <span className={toneClass(d.tone)} title={d.label}>
                    <span aria-hidden="true">{d.arrow}</span>
                    <span className="sr-only">{d.label}</span>
                  </span>
                )}
                <span className="truncate text-text-3">{h.name}</span>
                <span className="tnum text-text-3">
                  {Math.round((h.weight ?? 0) * 100)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
