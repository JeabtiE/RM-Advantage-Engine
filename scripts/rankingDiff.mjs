// rankingDiff.mjs — before/after client-ranking comparison for a demo-cache regen.
//
// WHY: Agent output is not reproducible run to run even at temperature 0 (e.g.
// N006 healthcare came back "positive" in one run and "neutral" in the next,
// and neutral sectors do not drive matching), so a regenerated cache can
// legitimately re-rank clients. A ranking change is therefore NOT a regen gate;
// instead the regen script prints this diff so a human reviews the new order
// before the cache is committed. Pure functions — no I/O, unit-tested.

// rankingDiff(before, after) — each argument is an affectedClients array in
// display order (or undefined when the scenario had no previous cache entry).
// Returns one row per client in either list.
export function rankingDiff(before = [], after = []) {
  const pos = (list) =>
    new Map(list.map((c, i) => [c.clientId, { rank: i + 1, score: c.priorityScore }]));
  const b = pos(before);
  const a = pos(after);
  const ids = [
    ...after.map((c) => c.clientId),
    ...before.map((c) => c.clientId).filter((id) => !a.has(id)),
  ];
  return ids.map((clientId) => {
    const was = b.get(clientId) ?? null;
    const now = a.get(clientId) ?? null;
    let change;
    if (!was) change = "added";
    else if (!now) change = "removed";
    else if (was.rank === now.rank && sameScore(was.score, now.score)) change = "same";
    else change = "moved";
    return { clientId, before: was, after: now, change };
  });
}

// Scores are sums of weights; compare with a tolerance so float noise
// (0.1 + 0.2) never reports a phantom change.
const sameScore = (x, y) => Math.abs(x - y) < 1e-9;

const fmt = (p) => (p ? `#${String(p.rank).padStart(2)} ${p.score.toFixed(2)}` : "   —    ");
const MARK = { same: " ", moved: "~", added: "+", removed: "-" };

// formatRankingDiff — printable table for one scenario plus a one-line verdict.
export function formatRankingDiff(newsId, rows) {
  const changed = rows.filter((r) => r.change !== "same").length;
  const lines = [
    `  Ranking diff ${newsId} (before → after):`,
    ...rows.map(
      (r) => `    ${MARK[r.change]} ${r.clientId.padEnd(6)} ${fmt(r.before)}  →  ${fmt(r.after)}`,
    ),
    changed === 0
      ? "    ranking unchanged"
      : `    ${changed} client(s) changed — REVIEW before committing the new cache`,
  ];
  return lines.join("\n");
}
