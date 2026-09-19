// ScriptViewer.jsx — the RM-facing phone scripts (Agent 3 output).
//
// This view is the visual half of the Four Eyes gate: scripts simply DO NOT
// exist until a human approves the draft (useDraft only calls Agent 3 inside
// approve()). So this component gates on draft.status === "approved" and shows
// nothing script-like before that — the gate is enforced in the UI, not just in
// the pipeline. Before approval the RM sees a pending message, never a draft
// script they might read to a client prematurely.
//
//   props:
//     draft   — the current Draft (or null). Read for status gating + reviewer.
//     scripts — Agent 3 output array (or null until generated). Each entry:
//               { clientId, name, riskProfile, ok, script? , error? }.
//               null while status is "approved" but the batch is still running.
//     stage   — PipelineStage, so the loading state can name Agent 3.
//     onRetry — () => void. Re-runs ONLY Agent 3 after a script_error (wires to
//               useDraft.retryScripts). The approval is NOT re-opened.
//
// LANGUAGE: chrome is English; the SCRIPTS THEMSELVES stay in the language
// Agent 3 wrote them in (Thai). They are read verbatim to a Thai client — a
// translated script would be the one thing in this app that must never be
// paraphrased.

import { useState } from "react";
import { DraftStatus, PipelineStage } from "../hooks/useDraft.js";
import { IconCheck, IconCopy } from "./icons.jsx";
import {
  Button,
  EmptyState,
  IconButton,
  MarkReported,
  Notice,
  Row,
  Rows,
  Section,
  Stages,
  riskLabel,
} from "./ui.jsx";

// The post-approval stage, named for the loading state.
const SCRIPT_STAGES = [
  { id: PipelineStage.AGENT3, label: "Agent 3 — per-client scripts" },
];

export default function ScriptViewer({ draft, scripts, stage, onRetry }) {
  const approved = draft?.status === DraftStatus.APPROVED;
  const scriptError = draft?.status === DraftStatus.SCRIPT_ERROR;

  // The Agent 3 batch threw for an approved draft. Checked BEFORE the loading
  // branch below: scripts stays null on this path, so without this the view
  // would show "generating…" forever with the error stranded on another view.
  // The draft is still approved, so retry re-runs Agent 3 only.
  if (scriptError) {
    return (
      <Notice
        tone="down"
        title="Script generation failed"
        action={
          <Button className="mt-3" onClick={() => onRetry?.()}>
            Retry generation
          </Button>
        }
      >
        <p>
          This draft is already approved — only script generation failed. Retry
          without approving again.
        </p>
        {draft.scriptError && (
          <p className="mt-2 break-words text-text-3">{draft.scriptError}</p>
        )}
      </Notice>
    );
  }

  // GATE: no scripts before Four Eyes approval. Covers null draft, analyzing,
  // pending, and rejected alike — none of them have client-facing scripts, and
  // showing one would defeat the whole point of the approval step.
  if (!approved) {
    return (
      <EmptyState
        title="Scripts appear after approval"
        hint={
          draft?.status === DraftStatus.REJECTED
            ? "This draft was rejected — no client scripts will be generated."
            : "Per-client scripts are generated only once the Four Eyes gate passes."
        }
      />
    );
  }

  // Approved, but Agent 3 hasn't returned yet (approve() flips status before the
  // async batch resolves). Show the named stage so the demo doesn't look empty
  // in that window instead of a bare list.
  if (!scripts) {
    return (
      <Section title="Generating" meta="Approved — writing per-client scripts">
        <Stages stages={SCRIPT_STAGES} active={stage ?? PipelineStage.AGENT3} />
      </Section>
    );
  }

  // Approved, but nobody was affected — generateAllScripts([]) returns []. Show a
  // real empty state instead of a "0 scripts" header over a bare list. (Mirrors
  // the zero-affected empty states in ClientList / ApprovalDashboard.)
  if (scripts.length === 0) {
    return (
      <EmptyState
        title="No scripts to generate"
        hint="This item doesn't touch any client portfolio, so there is nobody to call."
      />
    );
  }

  const okCount = scripts.filter((s) => s.ok).length;
  const failedCount = scripts.length - okCount;

  return (
    <Section
      title="Client scripts"
      meta={`Approved by ${draft.reviewedBy ?? "CIO"} — ready for the RM to call`}
      action={
        <span className="tnum shrink-0 text-caption text-text-3">
          {okCount}
        </span>
      }
    >
      {/* Rare: one or more clients' Agent 3 calls failed. allSettled means the
          batch still returned — surface the count so nobody assumes a missing
          script means "no insight for this client". */}
      {failedCount > 0 && (
        <div className="mb-3">
          <Notice tone="alert" title={`${failedCount} script(s) failed`}>
            Approve again to retry the whole batch.
          </Notice>
        </div>
      )}

      <Rows>
        {scripts.map((s) => (
          <Row key={s.clientId}>
            <ScriptRow entry={s} />
          </Row>
        ))}
      </Rows>
    </Section>
  );
}

// ScriptRow — one client's script: name + risk, the script body, and an
// icon-only copy button (the RM reads this on a call, so one-tap copy matters;
// copy is unambiguous and harmless, so it loses its text label). Failed entries
// show the error instead of a script.
function ScriptRow({ entry }) {
  const [copied, setCopied] = useState(false);

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
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-body font-medium text-text">
            {entry.name}
          </p>
          <span className="text-caption text-text-3">
            {riskLabel(entry.riskProfile)}
          </span>
        </div>
        {entry.ok && (
          <IconButton
            label={copied ? "Copied" : "Copy script"}
            icon={copied ? IconCheck : IconCopy}
            tone={copied ? "up" : undefined}
            onClick={onCopy}
            className="-mt-1 -mr-1.5"
          />
        )}
      </div>

      {entry.ok ? (
        <>
          <p className="mt-2 rounded-control bg-raised px-3 py-3 text-body leading-relaxed whitespace-pre-line text-text-2">
            <MarkReported text={entry.script} />
          </p>
          {/* Server flagged it as over the character budget (the proxy for the
              3-sentence rule). Shown in full — never truncated — so the RM can
              shorten it on the call without losing a caveat. */}
          {entry.length_exceeded && (
            <p className="tnum mt-2 text-caption text-alert">
              Over the length limit ({entry.script?.length ?? 0} characters) —
              trim before using.
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 rounded-control border-l-2 border-alert bg-raised px-3 py-3 text-caption text-alert">
          Generation failed: {entry.error}
        </p>
      )}
    </div>
  );
}
