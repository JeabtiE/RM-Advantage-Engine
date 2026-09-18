// useDraft.js — full state machine for the draft lifecycle.
//
//   idle → analyzing → pending → approved / rejected
//                 └────────────→ error         (pre-approval pipeline failure)
//                            approved → script_error ⇄ approved  (Agent 3 retry)
//
// The hook orchestrates the verified logic (claudeAPI.js + matching.js) in the
// exact order CLAUDE.md prescribes and never lets AI output skip the Four Eyes
// gate: scripts (Agent 3) are ONLY generated after a human calls approve().
//
//   analyzeNews(news):  Agent 1 (analyzeImpact) → findAffectedClients + priority
//                       → Agent 2 (factCheck) → status "pending"
//   approve(reviewedBy): status "approved" → generateAllScripts (Agent 3, batch)
//   reject(reviewedBy):  status "rejected", no scripts ever generated
//   retryScripts():      re-run ONLY Agent 3 after script_error (approval stands)
//   reset():             back to idle for the next news item
//
// Note the two distinct failure states: "error" means the draft never reached a
// human, while "script_error" means an APPROVED draft failed at script
// generation — the approval survives and only Agent 3 is retried.
//
// Why a single status string drives the UI: the whole demo is a linear
// pipeline, so one machine state (not a scatter of booleans) keeps NewsFeed /
// ApprovalDashboard / ScriptViewer reading from one source of truth.

import { useState, useCallback } from "react";
import { analyzeImpact, factCheck, generateAllScripts } from "../utils/claudeAPI.js";
import {
  findAffectedClients,
  buildHoldingsSummary,
  filterRelevantNews,
} from "../utils/matching.js";
import { cachedDemoRuns } from "../data/cachedDemoRun.js";
import { mockNews } from "../data/mockNews.js";

// The states the draft can be in. Exported so components can compare against
// named constants instead of stringly-typed literals scattered around the UI.
export const DraftStatus = {
  IDLE: "idle",
  ANALYZING: "analyzing",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  ERROR: "error",
  // Screened out by the deterministic pre-filter BEFORE Agent 1 ran — the news
  // has no ticker, held sector or macro hook into the book. Distinct from ERROR:
  // nothing failed, we simply declined to spend an API call. No draft is created
  // (see analyzeNews), so this never reaches the Four Eyes gate.
  NOT_RELEVANT: "not_relevant",
  // Approved by a human, but the Agent 3 batch THREW (not a per-client failure —
  // generateAllScripts settles those internally). Kept distinct from ERROR so the
  // Four Eyes decision is not lost: reviewedBy/approvedAt stay on the draft and
  // only script generation is retried. See runScriptGeneration below.
  SCRIPT_ERROR: "script_error",
};

// Sort helper: highest portfolio exposure first — this IS the "call these
// clients first" ranking (calculatePriority returns fraction of portfolio hit).
function byPriorityDesc(a, b) {
  return b.priorityScore - a.priorityScore;
}

// --- Demo-mode cache -------------------------------------------------------
// The demo scenarios are PRE-GENERATED (src/data/cachedDemoRun.js) so they never
// depend on Agent 1/2/3 at showtime — deterministic content, no API latency,
// immune to a rate-limit or outage. Two scenarios are cached:
//   N006 (Tariff/Gold)  — the dislocation money shot (all 10 clients match)
//   N003 (AI exports)   — the priority-filtering shot (only 3 of 10 match)
// Every other item still runs the live pipeline exactly as before. Regenerate
// with `npm run regen:cache` (escape hatch: scripts/regenerateDemoCache.mjs).
//
// INTEGRITY GUARD (runs once, at module load).
// getCachedRun() short-circuits on an EXACT newsId match, and that match fails
// SILENTLY: rename a news id in mockNews.js (the N005 gap makes a "tidy up the
// numbering" edit plausible) or let a cache key drift, and the cached scenario
// would quietly fall through to the LIVE API at showtime — slow, non-deterministic
// and dependent on the API being up, with no visible signal that it happened.
// Asserting the invariant here converts that silent fall-through into a loud
// boot failure we cannot miss during rehearsal.
for (const [key, run] of Object.entries(cachedDemoRuns)) {
  if (!mockNews.some((n) => n.id === key)) {
    throw new Error(
      `[useDraft] Demo cache is stale: cached scenario "${key}" no longer exists in ` +
        `mockNews.js. The demo would silently hit the live API for it. Restore that ` +
        `news id, or regenerate the cache (npm run regen:cache).`,
    );
  }
  // The map key and the entry's own newsId must agree, or lookups and the
  // regen script disagree about what was actually frozen.
  if (run?.newsId !== key) {
    throw new Error(
      `[useDraft] Demo cache is corrupt: entry keyed "${key}" carries newsId ` +
        `"${run?.newsId}". Regenerate the cache (npm run regen:cache).`,
    );
  }
}

// hasOwn (not a bare index) so a news id colliding with an Object.prototype key
// can never return a bogus "cached run".
function getCachedRun(newsId) {
  return Object.hasOwn(cachedDemoRuns, newsId) ? cachedDemoRuns[newsId] : null;
}

// Cosmetic-only pause so the "analyzing" / "generating" states are visible for
// the cached path (it would otherwise resolve in one frame). It is NOT an API
// call and adds no failure surface — set to 0 for a truly instant load.
const DEMO_CACHE_DELAY_MS = 600;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function useDraft() {
  const [status, setStatus] = useState(DraftStatus.IDLE);
  const [draft, setDraft] = useState(null);
  const [scripts, setScripts] = useState(null); // Agent 3 output, post-approval
  const [error, setError] = useState(null);
  // Machine-readable code from the endpoint (e.g. "live_mode_disabled") so the
  // UI can tell a deliberately disabled live mode apart from a real failure.
  const [errorCode, setErrorCode] = useState(null);
  // Pre-filter verdict for the last analyzeNews() call. Held separately from
  // `error` because being irrelevant is a normal outcome, not a failure.
  const [relevance, setRelevance] = useState(null);

  // analyzeNews — run the pre-approval pipeline for one news item.
  // Agent 1 → deterministic matching → Agent 2, then park at "pending" for the
  // CIO. Matching is intentionally sandwiched BEFORE Agent 2 so the fact check
  // is the last thing a human sees before reviewing (matches CLAUDE.md order).
  const analyzeNews = useCallback(async (news) => {
    setStatus(DraftStatus.ANALYZING);
    setError(null);
    setErrorCode(null);
    setScripts(null);
    setDraft(null);
    setRelevance(null);

    // Demo cache short-circuit — N006 loads the frozen pipeline output instantly
    // (no Agent 1/2, no matching call), keeping the demo deterministic and
    // API-independent. Built to the SAME Draft shape as the live path below so
    // every downstream view (ApprovalDashboard, ClientList, ScriptViewer) is
    // unaware which path produced it. Cannot throw → no try/catch needed here.
    const cached = getCachedRun(news.id);
    if (cached) {
      await sleep(DEMO_CACHE_DELAY_MS); // cosmetic; shows the analyzing state
      // A CIO-reviewed cache entry keeps the AI's original analysis untouched
      // and adds reviewedAnalysis (what matching + Agent 3 used). The draft
      // works on the reviewed version and carries the original + the review so
      // ApprovalDashboard can show exactly what the CIO changed.
      const analysis = cached.reviewedAnalysis ?? cached.analysis;
      setDraft({
        draftId: news.id,
        status: DraftStatus.PENDING,
        newsSource: { headline: news.headline, content: news.content },
        analysis,
        ...(cached.cioReview
          ? { aiAnalysis: cached.analysis, cioReview: cached.cioReview }
          : {}),
        affectedTickers: analysis.affected_tickers ?? [],
        affectedSectors: analysis.affected_sectors ?? [],
        sentiment: analysis.sentiment,
        reasoning: analysis.reasoning,
        dislocation: {
          detected: !!analysis.dislocation_detected,
          description: analysis.dislocation_description ?? "",
        },
        agent2Result: cached.agent2Result,
        affectedClients: cached.affectedClients,
        reviewedBy: null,
        approvedAt: null,
      });
      setStatus(DraftStatus.PENDING);
      return;
    }

    // [1.5] Relevance guard — deterministic, NO AI. Screens out news with no
    // ticker, held sector or macro hook into the book so Agent 1 is never called
    // on something with zero bearing on any client.
    //
    // Deliberately AFTER the demo-cache short-circuit: the guard exists purely to
    // save an API call, and the cached path makes none. Ordering it here means a
    // future false negative in the keyword map can never take down the cached
    // demo scenarios (N006 Tariff/Gold, N003 AI exports) at showtime.
    //
    // No draft is created — a screened-out item is not something a CIO reviews,
    // and leaving draft null keeps ApprovalDashboard / ClientList / ScriptViewer
    // on their existing empty states instead of rendering a half-built draft.
    const verdict = filterRelevantNews(news);
    if (!verdict.relevant) {
      setRelevance({ ...verdict, newsId: news.id, headline: news.headline });
      setStatus(DraftStatus.NOT_RELEVANT);
      return;
    }
    setRelevance({ ...verdict, newsId: news.id, headline: news.headline });

    try {
      // [2] Agent 1 — Impact + Dislocation Analyzer (LLM call #1).
      const holdingsSummary = buildHoldingsSummary();
      const analysis = await analyzeImpact(news, holdingsSummary);

      // [3] Matching + priority scoring — deterministic JS, NO AI.
      const affectedClients = findAffectedClients(analysis).sort(byPriorityDesc);

      // [4] Agent 2 — Fact Checker (LLM call #2). Verifies Agent 1 vs the source
      // news before any human sees it (the machine half of Four Eyes).
      const agent2Result = await factCheck(news, analysis);

      // Assemble the draft the CIO will review. Shape follows CLAUDE.md's Draft.
      setDraft({
        draftId: news.id, // one draft per news item in this demo
        status: DraftStatus.PENDING,
        newsSource: { headline: news.headline, content: news.content },
        // keep the raw Agent 1 analysis so Agent 3 can consume it verbatim later
        analysis,
        affectedTickers: analysis.affected_tickers ?? [],
        affectedSectors: analysis.affected_sectors ?? [],
        sentiment: analysis.sentiment,
        reasoning: analysis.reasoning,
        dislocation: {
          detected: !!analysis.dislocation_detected,
          description: analysis.dislocation_description ?? "",
        },
        agent2Result,
        affectedClients,
        reviewedBy: null,
        approvedAt: null,
      });
      setStatus(DraftStatus.PENDING);
    } catch (err) {
      // Any pipeline failure (Agent 1/2 API error, bad JSON) lands here so the
      // UI can show it instead of crashing mid-demo.
      setError(err?.message ?? String(err));
      setErrorCode(err?.code ?? null);
      setStatus(DraftStatus.ERROR);
    }
  }, []);

  // runScriptGeneration — [6] Agent 3 for an ALREADY-APPROVED draft. Shared by
  // approve() and retryScripts() so the failure handling is identical on both
  // paths. Takes the approved draft explicitly rather than reading `draft` state,
  // which has not re-rendered yet at the call site.
  const runScriptGeneration = useCallback(async (approvedDraft) => {
    // Demo cache short-circuit — serve the pre-generated scripts instead of
    // calling Agent 3. Same shape generateAllScripts returns, so ScriptViewer
    // renders them identically (typo guard already baked in at generation).
    const cached = getCachedRun(approvedDraft.draftId);
    if (cached) {
      await sleep(DEMO_CACHE_DELAY_MS); // cosmetic; shows the generating state
      setScripts(cached.scripts);
      return;
    }

    try {
      // Feed the fact-checked reasoning (adjusted_reasoning) when Agent 2
      // corrected it, otherwise Agent 1's original — so scripts never carry a
      // flagged claim.
      const analysisForScripts = {
        ...approvedDraft.analysis,
        reasoning:
          approvedDraft.agent2Result?.adjusted_reasoning ||
          approvedDraft.analysis.reasoning,
      };
      const results = await generateAllScripts(
        analysisForScripts,
        approvedDraft.affectedClients,
      );
      setScripts(results);
    } catch (err) {
      // generateAllScripts settles per-client, so a throw here is the whole batch
      // failing (e.g. programmer error), not one client's API call. Land in
      // SCRIPT_ERROR — NOT plain ERROR — and stamp it on the draft itself: the
      // draft's own status is what ScriptViewer gates on, so leaving it at
      // "approved" with scripts null would spin the loading state forever while
      // the error was only visible on another tab. The Four Eyes decision
      // (reviewedBy/approvedAt) is preserved so retryScripts() re-runs Agent 3
      // WITHOUT asking the CIO to approve a second time.
      const message = err?.message ?? String(err);
      setError(message);
      setScripts(null);
      setDraft((d) =>
        d ? { ...d, status: DraftStatus.SCRIPT_ERROR, scriptError: message } : d,
      );
      setStatus(DraftStatus.SCRIPT_ERROR);
    }
  }, []);

  // approve — the Four Eyes gate. ONLY here does approved insight become
  // client-facing scripts. Generates a script per affected client via Agent 3
  // (Promise.allSettled inside generateAllScripts — one failure won't wipe the
  // batch). reviewedBy is the CIO identity for the audit trail.
  const approve = useCallback(
    async (reviewedBy = "CIO") => {
      if (!draft) return;

      const approvedDraft = {
        ...draft,
        status: DraftStatus.APPROVED,
        reviewedBy,
        approvedAt: new Date().toISOString(),
      };
      setDraft(approvedDraft);
      setStatus(DraftStatus.APPROVED);
      setError(null);

      await runScriptGeneration(approvedDraft);
    },
    [draft, runScriptGeneration],
  );

  // retryScripts — recover from SCRIPT_ERROR by re-running ONLY Agent 3. The
  // human approval already happened and is still stamped on the draft, so this
  // deliberately does NOT re-open the Four Eyes gate (and does not overwrite
  // approvedAt): a transport failure in script generation is not a reason to
  // re-litigate the CIO's decision.
  const retryScripts = useCallback(async () => {
    if (!draft) return;

    const approvedDraft = {
      ...draft,
      status: DraftStatus.APPROVED,
      scriptError: null,
    };
    setDraft(approvedDraft);
    setStatus(DraftStatus.APPROVED);
    setError(null);

    await runScriptGeneration(approvedDraft);
  }, [draft, runScriptGeneration]);

  // reject — CIO declines the draft. No scripts are generated, ever. The draft
  // is kept (status "rejected") so the audit trail shows what was turned down.
  const reject = useCallback(
    (reviewedBy = "CIO") => {
      if (!draft) return;
      setDraft({
        ...draft,
        status: DraftStatus.REJECTED,
        reviewedBy,
        approvedAt: null,
      });
      setStatus(DraftStatus.REJECTED);
      setScripts(null);
    },
    [draft],
  );

  // reset — clear everything and return to idle for the next news item.
  const reset = useCallback(() => {
    setStatus(DraftStatus.IDLE);
    setDraft(null);
    setScripts(null);
    setError(null);
    setErrorCode(null);
    setRelevance(null);
  }, []);

  return {
    status,
    draft,
    scripts,
    error,
    errorCode,
    relevance,
    analyzeNews,
    approve,
    reject,
    retryScripts,
    reset,
  };
}

export default useDraft;
