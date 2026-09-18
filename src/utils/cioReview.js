// cioReview.js — apply a human CIO review (a committed JSON file) to a cached
// Agent 1 analysis. Deterministic, NO AI, no I/O — used by the regen script
// (`--apply-cio-review <newsId>`) and its tests.
//
// WHY A FILE, NOT AN IN-APP EDITOR: the demo has no persistence or login, and a
// review that changes what clients hear must be auditable. A committed file
// gives a git-tracked reviewer, timestamp, before/after and rationale for every
// change, and the original AI output stays in the cache untouched.
//
// Review file shape (src/data/cioReviews/<newsId>.json):
//   { reviewer, reviewedAt, changes: [{ path, before, after, rationale }] }
//
// Allowed paths ONLY:
//   reasoning | sentiment | dislocation_description
//   sector_impacts[<sector>].direction | sector_impacts[<sector>].reason
// `before` must equal the current cached value exactly, or the change is
// rejected as stale (the analysis moved on since the CIO read it).

export const TEAM_DECISION_MARKER = "TEAM DECISION NEEDED";
export const DRAFT_REVIEWER_PREFIX = "DRAFT";

const TOP_LEVEL_PATHS = new Set(["reasoning", "sentiment", "dislocation_description"]);
const SECTOR_PATH = /^sector_impacts\[([a-z_]+)\]\.(direction|reason)$/;
const DIRECTIONS = new Set(["positive", "negative", "neutral"]);

// parsePath — { kind: "top", key } | { kind: "sector", sector, field } | null
export function parsePath(path) {
  if (typeof path !== "string") return null;
  if (TOP_LEVEL_PATHS.has(path)) return { kind: "top", key: path };
  const m = path.match(SECTOR_PATH);
  return m ? { kind: "sector", sector: m[1], field: m[2] } : null;
}

function readPath(analysis, parsed) {
  if (parsed.kind === "top") return { found: true, value: analysis?.[parsed.key] };
  const entry = (analysis?.sector_impacts ?? []).find((s) => s?.sector === parsed.sector);
  return entry ? { found: true, value: entry[parsed.field] } : { found: false };
}

// reviewBlockers — reasons the review may NOT be applied yet (it is still a
// draft or has an open team decision). Empty array = ready.
export function reviewBlockers(review) {
  const blockers = [];
  const reviewer = typeof review?.reviewer === "string" ? review.reviewer.trim() : "";
  if (!reviewer) blockers.push("reviewer is missing");
  else if (reviewer.toUpperCase().startsWith(DRAFT_REVIEWER_PREFIX)) {
    blockers.push(`reviewer is still a draft ("${reviewer}")`);
  }
  (Array.isArray(review?.changes) ? review.changes : []).forEach((c, i) => {
    const text = JSON.stringify(c ?? {});
    if (text.includes(TEAM_DECISION_MARKER)) {
      blockers.push(`changes[${i}] (${c?.path}) still contains "${TEAM_DECISION_MARKER}"`);
    }
  });
  return blockers;
}

// validateReviewShape — structural errors only (no comparison with the cache).
export function validateReviewShape(review) {
  const errors = [];
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return ["review must be a JSON object"];
  }
  if (typeof review.reviewer !== "string" || !review.reviewer.trim()) {
    errors.push("reviewer must be a non-empty string");
  }
  if (typeof review.reviewedAt !== "string" || Number.isNaN(Date.parse(review.reviewedAt))) {
    errors.push("reviewedAt must be an ISO date string");
  }
  if (!Array.isArray(review.changes) || review.changes.length === 0) {
    errors.push("changes must be a non-empty array");
    return errors;
  }
  const seen = new Set();
  review.changes.forEach((c, i) => {
    const at = `changes[${i}]`;
    if (!c || typeof c !== "object") return errors.push(`${at} must be an object`);
    if (!parsePath(c.path)) {
      errors.push(`${at}: path "${c.path}" is not allowed`);
    } else if (seen.has(c.path)) {
      errors.push(`${at}: path "${c.path}" appears more than once`);
    }
    seen.add(c.path);
    for (const k of ["before", "after", "rationale"]) {
      if (typeof c[k] !== "string") errors.push(`${at}: ${k} must be a string`);
    }
    if (typeof c.rationale === "string" && !c.rationale.trim()) {
      errors.push(`${at}: rationale must not be empty`);
    }
  });
  return errors;
}

// applyCioReview — returns { analysis, errors }. On ANY error, analysis is null
// and nothing is applied (all-or-nothing). The input is never mutated.
// A review that still has blockers (draft reviewer / team decision) is refused.
export function applyCioReview(original, review) {
  const errors = [...validateReviewShape(review), ...reviewBlockers(review)];
  if (errors.length) return { analysis: null, errors };

  const analysis = structuredClone(original);
  for (const [i, c] of review.changes.entries()) {
    const at = `changes[${i}] (${c.path})`;
    const parsed = parsePath(c.path);
    const current = readPath(analysis, parsed);
    if (!current.found) {
      errors.push(`${at}: sector "${parsed.sector}" has no sector_impacts entry`);
      continue;
    }
    if (current.value !== c.before) {
      errors.push(`${at}: stale — "before" does not match the cached value`);
      continue;
    }
    const isEnum = c.path === "sentiment" || (parsed.kind === "sector" && parsed.field === "direction");
    if (isEnum && !DIRECTIONS.has(c.after)) {
      errors.push(`${at}: after must be "positive" | "negative" | "neutral"`);
      continue;
    }
    if (!isEnum && !c.after.trim()) {
      errors.push(`${at}: after must not be empty`);
      continue;
    }
    if (parsed.kind === "top") {
      analysis[parsed.key] = c.after;
    } else {
      const entry = analysis.sector_impacts.find((s) => s.sector === parsed.sector);
      entry[parsed.field] = c.after;
    }
  }
  return errors.length ? { analysis: null, errors } : { analysis, errors: [] };
}
