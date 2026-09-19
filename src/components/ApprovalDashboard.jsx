// ApprovalDashboard.jsx — the Four Eyes approval gate (CIO persona), and since
// Phase 6.1 the whole right-pane "Approval" destination.
//
// This is the legal safety mechanism: NOTHING (Agent 3 scripts, client contact)
// happens until a human approves here. See CLAUDE.md hard constraint #1.
//
// WHAT IT ABSORBED IN 6.1: the pipeline's pre-approval states (analyzing, the
// four error/notice cases, screened-out) and the verdict block used to live at
// the bottom of the News tab, which no longer exists as a destination. They
// belong here — this pane is where the result of an analysis is acted on, and
// the verdict was already duplicated in both places almost verbatim.
//
//   props:
//     draft        — the pending Draft from useDraft (or null → empty state)
//     status       — DraftStatus, so this pane can render the pipeline states
//     error/errorCode/relevance/stage — pipeline reporting, display only
//     selectedNews — the rail's current selection (for the pre-analysis state)
//     onApprove    — (reviewedBy: string) => void   (wires to useDraft.approve)
//     onReject     — (reviewedBy: string) => void   (wires to useDraft.reject)
//     onRetry      — () => void, re-runs the analysis after a failure
//
// ROADMAP (deliberate MVP scope cut, not a missed requirement): CLAUDE.md notes
// the CIO "can edit, approve, or reject." Inline editing is intentionally
// deferred past the hackathon MVP — approve/reject exercises the Four Eyes gate
// end-to-end, which is what the demo must prove.
//
// NOTE FOR EDITORS: tests/approval-cio-panel.test.js SSR-renders this component
// and asserts on the exact strings "Edited by CIO", "Original (AI)",
// "After CIO edit", "This verdict covers the original AI output" and
// "CIO-edited version". Restyle freely; update the test if you reword them.
//
// LANGUAGE: chrome is English, CONTENT is whatever the pipeline produced. Agent
// 1's reasoning, sector reasons, Agent 2's issues and the CIO's rationale all
// render as-is — they are the model's words and a translation layer would be a
// place for them to change meaning.

import { useState } from "react";
import { DraftStatus, PipelineStage } from "../hooks/useDraft.js";
import { isKeyAccount } from "../utils/matching.js";
import { LIVE_MODE_DISABLED, RESPONSE_TRUNCATED } from "../utils/claudeAPI.js";
import { mockNews } from "../data/mockNews.js";
import { cachedDemoRuns } from "../data/cachedDemoRun.js";
import KeyAccountBadge from "./KeyAccountBadge.jsx";
import { IconChevronDown } from "./icons.jsx";
import {
  Button,
  ClientRow,
  EmptyState,
  IconButton,
  MarkReported,
  Notice,
  Row,
  Rows,
  SCOPE_META,
  Section,
  SectorImpacts,
  SENTIMENT_META,
  Stages,
  Tag,
  toneClass,
} from "./ui.jsx";

// CIO identity stamped onto the audit trail on approve/reject. A single reviewer
// for the demo; a real deployment would read this from the logged-in user.
const REVIEWER = "CIO";

// Preset items that resolve from the frozen cache (no API call). Derived from
// the cache itself so the "still works" list can never drift from what is cached.
const CACHED_DEMO_NEWS = mockNews.filter((n) =>
  Object.hasOwn(cachedDemoRuns, n.id),
);

// The pre-approval pipeline, named for the loading state. Matches the real call
// order in useDraft.analyzeNews.
const ANALYSIS_STAGES = [
  { id: PipelineStage.AGENT1, label: "Agent 1 — impact & dislocation" },
  { id: PipelineStage.MATCHING, label: "Match clients & rank priority" },
  { id: PipelineStage.AGENT2, label: "Agent 2 — fact check" },
];

export default function ApprovalDashboard({
  draft,
  status,
  error,
  errorCode,
  relevance,
  stage,
  selectedNews,
  onApprove,
  onReject,
  onRetry,
}) {
  // Collapse long source news by default so the priority list and the
  // approve/reject buttons stay reachable without heavy scrolling mid-demo.
  // (Declared before the early returns — hooks must run unconditionally.)
  const [newsExpanded, setNewsExpanded] = useState(false);

  // --- Pipeline states, in the order they can occur --------------------------

  if (status === DraftStatus.ANALYZING) {
    return (
      <Section title="Analyzing">
        <Stages stages={ANALYSIS_STAGES} active={stage} />
      </Section>
    );
  }

  // Live analysis switched off server-side (LIVE_AGENT_ENABLED unset) — the
  // public deployment's normal state, not a failure. Neutral notice, no retry
  // (retrying cannot succeed), and a pointer to the cached scenarios.
  if (status === DraftStatus.ERROR && errorCode === LIVE_MODE_DISABLED) {
    return (
      <Notice tone="flat" title="Live analysis is off on the public demo">
        <p>
          This item needs a live AI call, which is disabled to prevent
          unauthorised API-key use. These items have a reviewed analysis cached
          and run every step end to end:
        </p>
        <ul className="mt-2 space-y-1">
          {CACHED_DEMO_NEWS.map((n) => (
            <li key={n.id} className="text-text">
              · {n.headline}
            </li>
          ))}
        </ul>
      </Notice>
    );
  }

  // The model hit its token budget. Not the user's fault and not a bad news
  // item — say so, and offer the retry (a shorter answer may fit).
  if (status === DraftStatus.ERROR && errorCode === RESPONSE_TRUNCATED) {
    return (
      <Notice
        tone="alert"
        title="Analysis was cut off (model length limit)"
        action={
          <Button className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        The response came back incomplete, so it was discarded — no partial
        analysis reaches the approval gate. If this repeats, ask an
        administrator to raise the max_tokens limit.
      </Notice>
    );
  }

  if (status === DraftStatus.ERROR) {
    return (
      <Notice
        tone="down"
        title="Analysis failed"
        action={
          <Button className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        <p className="break-words">{error}</p>
      </Notice>
    );
  }

  // Screened out before Agent 1 — not a failure, so a neutral notice. Naming the
  // saved API call is the point: it shows the filter did its job.
  //
  // relevance.reason is produced by filterRelevantNews (src/utils/matching.js)
  // and is Thai. It is pipeline output, not chrome, so it renders as-is.
  if (status === DraftStatus.NOT_RELEVANT && relevance) {
    return (
      <Notice
        tone="flat"
        title="Not relevant to the client book — analysis skipped"
      >
        <p>{relevance.reason}</p>
        <p className="mt-1.5 text-text-3">
          Agent 1 was never called (one API call saved) and no draft entered the
          approval gate.
        </p>
      </Notice>
    );
  }

  // Empty state — no draft to review yet (before analysis, or after reset).
  if (!draft) {
    return (
      <EmptyState
        title={selectedNews ? "Ready to analyze" : "No draft pending review"}
        hint={
          selectedNews
            ? "Run the analysis from the news list to produce a draft for review."
            : "Select a news item and analyze it — the result appears here for the CIO to review."
        }
      />
    );
  }

  // --- The review itself -----------------------------------------------------

  const dislocated = draft.dislocation?.detected;
  const sentiment = SENTIMENT_META[draft.sentiment] ?? SENTIMENT_META.neutral;
  const factOk = draft.agent2Result?.is_valid;
  const issues = draft.agent2Result?.flagged_issues ?? [];
  const adjusted = draft.agent2Result?.adjusted_reasoning;
  const factNotes = Array.isArray(
    draft.agent2Result?.factcheck_normalization_notes,
  )
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
  // Sectors with no explicit impact keep the plain tag (cached runs: all of them).
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
    <div className="space-y-8">
      {/* Section header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-body font-semibold text-text">
            Four Eyes approval
          </h2>
          <p className="mt-1 text-caption text-text-3">
            The CIO checks the reasoning, the fact check and the client list
            before approving.
          </p>
        </div>
        <StatusBadge status={draft.status} />
      </div>

      {/* Verdict — the decision-critical signal, stated first and largest */}
      <section>
        <p
          className={`text-caption font-semibold tracking-[0.08em] uppercase ${
            dislocated ? "text-alert" : "text-text-3"
          }`}
        >
          {dislocated
            ? "Dislocation found — an opportunity the market missed"
            : "No dislocation — the market reacted as expected"}
        </p>
        <p className="mt-3 text-body leading-relaxed font-medium text-text sm:text-lead">
          <MarkReported
            text={dislocated ? draft.dislocation.description : draft.reasoning}
          />
        </p>
        {cioChanges.length > 0 && (
          <p className="mt-2 text-caption text-alert">
            CIO-edited version — the original AI text is under “Edited by CIO”.
          </p>
        )}
        <div className="mt-6 flex items-baseline gap-3 border-t border-hairline pt-5">
          <span className="tnum text-display font-semibold text-text">
            {clients.length}
          </span>
          <span className="text-caption text-text-2">
            Affected clients — these receive a script
          </span>
        </div>
      </section>

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

      {/* Agent 1 analysis */}
      <Section title="Analysis (Agent 1)">
        <div className="space-y-4 rounded-card bg-surface px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption text-text-3">Sentiment</span>
            <span
              className={`text-body font-semibold ${toneClass(sentiment.tone)}`}
            >
              {sentiment.label}
            </span>
            {scope && <Tag title={scope.hint}>Scope: {scope.label}</Tag>}
          </div>
          <p className="text-body leading-relaxed text-text-2">
            <MarkReported text={draft.reasoning} />
          </p>

          {/* Per-sector direction + reason when Agent 1 supplied them. Neutral
              sectors are listed but, by server rule, do not select clients —
              the label says so, since they are absent from affectedSectors.
              The group carries the "expected, not observed" caption. */}
          <SectorImpacts impacts={sectorImpacts} />

          {(plainSectors.length > 0 ||
            (draft.affectedTickers ?? []).length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {plainSectors.map((s) => (
                <Tag key={s}>{s}</Tag>
              ))}
              {(draft.affectedTickers ?? []).map((t) => (
                <Tag key={t} className="text-text">
                  {t}
                </Tag>
              ))}
            </div>
          )}

          {/* Server-side consistency fixes to Agent 1's output. Shown so the
              CIO approves what the matcher actually used, not a silent edit.
              The notes themselves come from api/claude-agent.js and are Thai —
              pipeline output, rendered as-is under an English label. */}
          {notes.length > 0 && (
            <div className="border-t border-hairline pt-3">
              <p className="text-caption font-semibold text-text-2">
                Automatic normalization
              </p>
              <ul className="mt-1.5 space-y-1 text-caption leading-relaxed text-text-3">
                {notes.map((note, i) => (
                  <li key={i}>· {note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      {/* Agent 2 fact check */}
      <Section title="Fact check (Agent 2)">
        <div className="space-y-3 rounded-card bg-surface px-4 py-4">
          {cioChanges.length > 0 && (
            <p className="text-caption text-text-3">
              This verdict covers the original AI output (before the CIO edit).
            </p>
          )}
          <p
            className={`text-body font-semibold ${factOk ? "text-up" : "text-alert"}`}
          >
            {factOk ? "Passed — no issues found" : "Issues to review"}
          </p>
          {issues.length > 0 && (
            <ul className="space-y-1 text-caption leading-relaxed text-alert">
              {issues.map((issue, i) => (
                <li key={i}>· {issue}</li>
              ))}
            </ul>
          )}
          {/* Show the corrected reasoning only when it differs from Agent 1's —
              that's the version Agent 3 will actually use if approved. */}
          {adjusted && adjusted !== draft.reasoning && (
            <div className="border-l-2 border-alert pl-3">
              <p className="text-caption font-semibold text-alert">
                Corrected reasoning (used to generate scripts)
              </p>
              <p className="mt-1 text-caption leading-relaxed text-text-2">
                <MarkReported text={adjusted} />
              </p>
            </div>
          )}
          {/* Server guard corrections (e.g. is_valid re-derived from the issue
              list). Absent on cached runs and on consistent responses. */}
          {factNotes.length > 0 && (
            <div className="border-t border-hairline pt-3">
              <p className="text-caption font-semibold text-text-2">
                Automatic normalization
              </p>
              <ul className="mt-1.5 space-y-1 text-caption leading-relaxed text-text-3">
                {factNotes.map((note, i) => (
                  <li key={i}>· {note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      {/* Affected clients — who gets contacted if approved */}
      <Section
        title="Clients receiving a script (by priority)"
        action={
          <span className="tnum shrink-0 text-caption text-text-3">
            {clients.length}
          </span>
        }
      >
        {clients.length === 0 ? (
          <EmptyState
            title="No affected clients"
            hint="Approving will not generate a script for anyone."
          />
        ) : (
          <Rows>
            {clients.map((client, i) => (
              <Row key={client.clientId}>
                <ClientRow
                  client={client}
                  rank={i + 1}
                  keyAccount={isKeyAccount(client)}
                >
                  {isKeyAccount(client) && <KeyAccountBadge />}
                </ClientRow>
              </Row>
            ))}
          </Rows>
        )}
      </Section>

      {/* Action bar — the gate itself. Buttons only while pending.
          DELIBERATELY NOT ICON-ONLY: this is the human gate on client-facing
          output and an accidental click is unrecoverable, so both actions keep
          explicit text labels. Reject is further distinguished by a red outline
          and by sitting apart from the light-on-dark primary. */}
      {isPending && (
        <div className="chrome sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-hairline px-4 py-3">
          <Button
            onClick={() => onReject?.(REVIEWER)}
            className="border-down text-down hover:border-down hover:text-down"
          >
            Reject
          </Button>
          <Button variant="primary" onClick={() => onApprove?.(REVIEWER)}>
            Approve
          </Button>
        </div>
      )}

      {/* Post-decision confirmation — replaces the buttons once decided */}
      {(isApproved || isRejected || isScriptError) && (
        <Notice
          tone={isApproved ? "up" : isScriptError ? "down" : "flat"}
          title={
            isApproved
              ? "Approved — generating client scripts"
              : isScriptError
                ? "Approved — script generation failed (retry from Scripts)"
                : "Rejected — no scripts will be generated and no client contacted"
          }
        >
          <span className="text-text-3">
            Reviewed by {draft.reviewedBy ?? REVIEWER}
            {draft.approvedAt
              ? ` · ${new Date(draft.approvedAt).toLocaleString("en-GB")}`
              : ""}
          </span>
        </Notice>
      )}
    </div>
  );
}

// Labels for the review paths the CIO may edit (see src/utils/cioReview.js).
function cioPathLabel(path) {
  const top = {
    reasoning: "Reasoning",
    sentiment: "Sentiment",
    dislocation_description: "Dislocation description",
  }[path];
  if (top) return top;
  const m = /^sector_impacts\[(.+)\]\.(direction|reason)$/.exec(path ?? "");
  if (m) return `${m[1]} — ${m[2] === "direction" ? "direction" : "reason"}`;
  return path;
}

// CioReviewPanel — "Edited by CIO": who reviewed, and for each change the
// original AI text (before), the CIO's version (after) and the rationale.
function CioReviewPanel({ review, changes }) {
  const reviewedAt = review?.reviewedAt ? new Date(review.reviewedAt) : null;
  return (
    <Section
      title="Edited by CIO"
      meta="The client list and scripts below use the edited version — the AI original is shown with each change."
      action={
        <span className="shrink-0 text-caption text-text-3">
          {review?.reviewer}
          {reviewedAt && !Number.isNaN(reviewedAt.getTime())
            ? ` · ${reviewedAt.toLocaleString("en-GB")}`
            : ""}
        </span>
      }
    >
      <Rows>
        {changes.map((c) => (
          <Row key={c.path} className="px-4 py-3">
            <p className="text-caption font-semibold text-text">
              {cioPathLabel(c.path)}
            </p>
            {/* Both versions stay plain and fully readable — no strikethrough:
                the CIO is reviewing wording, and struck-through Thai is hard to
                read on a screen the presenter is talking over. */}
            <p className="mt-2 text-caption text-text-3">Original (AI)</p>
            <p className="text-caption leading-relaxed text-text-2">
              {c.before}
            </p>
            <p className="mt-2 text-caption text-up">After CIO edit</p>
            <p className="text-caption leading-relaxed text-text">{c.after}</p>
            <p className="mt-2 text-caption text-text-3">CIO rationale</p>
            <p className="text-caption leading-relaxed text-text-2">
              {c.rationale}
            </p>
          </Row>
        ))}
      </Rows>
    </Section>
  );
}

// SourceNews — headline + collapsible body. Shows the first ~150 chars with an
// icon-only expand toggle when the content is longer. Expand/collapse is the
// textbook unambiguous, recoverable action, so it loses its text label.
const PREVIEW_CHARS = 150;
function SourceNews({ headline, content, expanded, onToggle }) {
  const isLong = content.length > PREVIEW_CHARS;
  const shown =
    expanded || !isLong ? content : `${content.slice(0, PREVIEW_CHARS)}…`;

  return (
    <Section title="Source">
      <div className="rounded-card bg-surface px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-body font-semibold text-text">{headline}</h3>
          {isLong && (
            <IconButton
              label={expanded ? "Collapse article" : "Expand article"}
              icon={IconChevronDown}
              onClick={onToggle}
              className={`-mt-1 -mr-1.5 transition-transform duration-(--duration-base) ease-(--ease-out) ${
                expanded ? "rotate-180" : ""
              }`}
            />
          )}
        </div>
        <p className="mt-2 text-caption leading-relaxed text-text-2">{shown}</p>
      </div>
    </Section>
  );
}

// StatusBadge — small outlined tag mirroring the draft's machine state.
function StatusBadge({ status }) {
  const meta = {
    [DraftStatus.PENDING]: { label: "Pending review", tone: "alert" },
    [DraftStatus.APPROVED]: { label: "Approved", tone: "up" },
    [DraftStatus.REJECTED]: { label: "Rejected", tone: "flat" },
    [DraftStatus.SCRIPT_ERROR]: {
      label: "Approved · scripts failed",
      tone: "down",
    },
  }[status] ?? { label: status, tone: "flat" };

  return <Tag tone={meta.tone}>{meta.label}</Tag>;
}
