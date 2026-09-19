// metrics.mjs — pure metric functions for the Agent 1 stability eval.
//
// No network, no I/O: the runner (stability.mjs) collects N normalized Agent 1
// outputs per news item and hands them here. Kept separate so the metrics can be
// unit-tested against synthetic distributions (tests/eval-metrics.test.js).
//
// WHAT "STABILITY" MEANS HERE: the same news item, the same prompt and
// temperature 0, run N times. Anything below 100% agreement is the model
// changing its mind between identical calls. These are descriptive counts, not
// a benchmark or a pass/fail bar.

// modal — the most frequent value and the share of runs that agree with it.
// Ties break by first-seen order so the result is deterministic.
export function modal(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let value = null;
  let count = 0;
  for (const [v, c] of counts) {
    if (c > count) {
      value = v;
      count = c;
    }
  }
  return {
    value,
    count,
    runs: values.length,
    share: values.length ? count / values.length : 0,
    distribution: Object.fromEntries(counts),
  };
}

const DIRECTIONS = ["positive", "negative", "neutral"];

// sectorMetrics — per sector: how many runs listed it at all, the direction
// distribution across the runs that did, and the modal direction + its share.
// `listedShare` counts runs where the sector appeared in sector_impacts;
// `matchingShare` counts runs where it survived into affected_sectors (neutral
// sectors are removed there by normalization, so the two differ on purpose).
export function sectorMetrics(outputs) {
  const sectors = new Map();
  for (const out of outputs) {
    for (const impact of out?.sector_impacts ?? []) {
      if (!impact?.sector) continue;
      if (!sectors.has(impact.sector)) sectors.set(impact.sector, []);
      sectors.get(impact.sector).push(impact.direction ?? "neutral");
    }
  }
  // A sector can appear in affected_sectors without a sector_impacts entry.
  for (const out of outputs) {
    for (const s of out?.affected_sectors ?? []) {
      if (!sectors.has(s)) sectors.set(s, []);
    }
  }

  const runs = outputs.length;
  const result = {};
  for (const [sector, directions] of [...sectors].sort(([a], [b]) => a.localeCompare(b))) {
    const counts = Object.fromEntries(DIRECTIONS.map((d) => [d, 0]));
    for (const d of directions) counts[d] = (counts[d] ?? 0) + 1;
    const m = modal(directions);
    const inMatching = outputs.filter((o) => (o?.affected_sectors ?? []).includes(sector)).length;
    result[sector] = {
      listedRuns: directions.length,
      listedShare: runs ? directions.length / runs : 0,
      matchingRuns: inMatching,
      matchingShare: runs ? inMatching / runs : 0,
      directionCounts: counts,
      modalDirection: m.value,
      // Share among the runs that listed the sector (not of all runs).
      modalDirectionShare: m.share,
      flipped: directions.length > 0 && new Set(directions).size > 1,
    };
  }
  return result;
}

// tickerMetrics — mean list length, plus which tickers are unanimous vs partial.
export function tickerMetrics(outputs) {
  const runs = outputs.length;
  const lists = outputs.map((o) => [...new Set(o?.affected_tickers ?? [])]);
  const counts = new Map();
  for (const list of lists) for (const t of list) counts.set(t, (counts.get(t) ?? 0) + 1);
  const always = [];
  const sometimes = [];
  for (const [t, c] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    (c === runs ? always : sometimes).push({ ticker: t, runs: c });
  }
  return {
    meanCount: runs ? lists.reduce((n, l) => n + l.length, 0) / runs : 0,
    minCount: runs ? Math.min(...lists.map((l) => l.length)) : 0,
    maxCount: runs ? Math.max(...lists.map((l) => l.length)) : 0,
    always: always.map((a) => a.ticker),
    sometimes,
  };
}

// clientMetrics — how stable the downstream call list is. `clientSets` is one
// array of client ids per run (the runner produces these with
// findAffectedClients, so matching.js stays the single source of truth).
export function clientMetrics(clientSets) {
  const runs = clientSets.length;
  const keys = clientSets.map((ids) => [...ids].sort().join(","));
  const m = modal(keys);
  const perClient = new Map();
  for (const ids of clientSets) for (const id of new Set(ids)) perClient.set(id, (perClient.get(id) ?? 0) + 1);
  return {
    runs,
    identicalSetShare: m.share, // share of runs producing the modal client set
    distinctSets: new Set(keys).size,
    meanCount: runs ? clientSets.reduce((n, ids) => n + ids.length, 0) / runs : 0,
    perClient: Object.fromEntries(
      [...perClient].sort(([a], [b]) => a.localeCompare(b)).map(([id, c]) => [id, { runs: c, share: c / runs }]),
    ),
  };
}

// itemMetrics — everything for one news item.
//
// stabilityScore is the mean of the modal-agreement shares for event_scope,
// sentiment, dislocation_detected, the identical-client-set share, and the mean
// per-sector modal-direction share. It is a ROUGH INDICATOR for spotting which
// item moved most between runs — not a benchmark, not a quality measure, and
// not comparable across different N or different news items.
export function itemMetrics({ newsId, outputs, clientSets }) {
  const runs = outputs.length;
  const scope = modal(outputs.map((o) => o?.event_scope ?? "(missing)"));
  const sentiment = modal(outputs.map((o) => o?.sentiment ?? "(missing)"));
  const dislocationRuns = outputs.filter((o) => o?.dislocation_detected === true).length;
  const sectors = sectorMetrics(outputs);
  const clients = clientMetrics(clientSets);

  const sectorShares = Object.values(sectors)
    .filter((s) => s.listedRuns > 0)
    .map((s) => s.modalDirectionShare);
  const meanSectorShare = sectorShares.length
    ? sectorShares.reduce((a, b) => a + b, 0) / sectorShares.length
    : 1;
  const dislocationShare = runs ? Math.max(dislocationRuns, runs - dislocationRuns) / runs : 0;

  const components = [
    scope.share,
    sentiment.share,
    dislocationShare,
    clients.identicalSetShare,
    meanSectorShare,
  ];

  return {
    newsId,
    runs,
    eventScope: scope,
    sentiment,
    dislocation: {
      detectedRuns: dislocationRuns,
      detectedShare: runs ? dislocationRuns / runs : 0,
      agreementShare: dislocationShare,
    },
    sectors,
    tickers: tickerMetrics(outputs),
    clients,
    stabilityScore: components.reduce((a, b) => a + b, 0) / components.length,
    flippedSectors: Object.entries(sectors)
      .filter(([, s]) => s.flipped)
      .map(([sector, s]) => ({ sector, directionCounts: s.directionCounts })),
  };
}

const pct = (x) => `${(x * 100).toFixed(0)}%`;

// toMarkdown — one table per news item, plus the run's provenance header.
export function toMarkdown({ model, temperature, runs, startedAt, items, callsUsed, notes = [] }) {
  const lines = [
    "# Agent 1 stability eval — latest run",
    "",
    `- **Model:** \`${model}\``,
    `- **Temperature:** ${temperature}`,
    `- **Runs per item (N):** ${runs}`,
    `- **Date:** ${startedAt}`,
    `- **Real Anthropic calls:** ${callsUsed}`,
    "",
    "> These numbers are a snapshot of ONE session. They are not a guarantee of",
    "> future behaviour, not a benchmark, and not a quality judgement: the model",
    "> can answer differently on the next run even at temperature 0. The",
    "> stability score is the mean of the modal-agreement shares below — a rough",
    "> indicator for spotting which item moved most, nothing more.",
    "",
  ];
  for (const n of notes) lines.push(`> ⚠️ ${n}`, "");

  for (const item of items) {
    lines.push(`## ${item.newsId}${item.headline ? ` — ${item.headline}` : ""}`, "");
    // An item can be BOTH errored and partially measured: a failed run stops
    // that item, but the runs already completed are still real data and are
    // reported (with the error above them) rather than thrown away.
    if (item.error) {
      lines.push(
        `**Incomplete:** ${item.error}`,
        "",
        item.runs
          ? `Metrics below cover the ${item.runs} completed run(s) only — treat them as indicative.`
          : "No run completed, so there is nothing to measure.",
        "",
      );
      if (!item.runs) continue;
    }
    lines.push(
      `Runs: ${item.runs} · stability score: **${pct(item.stabilityScore)}** (rough indicator)`,
      "",
      "| Field | Modal value | Agreement | Distribution |",
      "|---|---|---|---|",
      `| event_scope | \`${item.eventScope.value}\` | ${pct(item.eventScope.share)} | ${fmtDist(item.eventScope.distribution)} |`,
      `| sentiment | \`${item.sentiment.value}\` | ${pct(item.sentiment.share)} | ${fmtDist(item.sentiment.distribution)} |`,
      `| dislocation_detected | \`${item.dislocation.detectedRuns > item.runs / 2}\` | ${pct(item.dislocation.agreementShare)} | detected in ${item.dislocation.detectedRuns}/${item.runs} |`,
      "",
      "| Sector | Listed in | Used for matching | positive / negative / neutral | Modal | Flipped |",
      "|---|---|---|---|---|---|",
    );
    for (const [sector, s] of Object.entries(item.sectors)) {
      const d = s.directionCounts;
      lines.push(
        `| ${sector} | ${s.listedRuns}/${item.runs} | ${s.matchingRuns}/${item.runs} | ${d.positive} / ${d.negative} / ${d.neutral} | ${s.modalDirection ?? "—"} (${pct(s.modalDirectionShare)}) | ${s.flipped ? "**yes**" : "no"} |`,
      );
    }
    const t = item.tickers;
    lines.push(
      "",
      `**affected_tickers:** mean ${t.meanCount.toFixed(1)} (min ${t.minCount}, max ${t.maxCount}) · ` +
        `every run: ${t.always.length ? t.always.join(", ") : "—"} · ` +
        `some runs: ${t.sometimes.length ? t.sometimes.map((s) => `${s.ticker} (${s.runs}/${item.runs})`).join(", ") : "—"}`,
      "",
      `**Matched clients:** mean ${item.clients.meanCount.toFixed(1)} · ` +
        `identical client set in ${pct(item.clients.identicalSetShare)} of runs · ` +
        `${item.clients.distinctSets} distinct set(s)`,
      "",
      "| Client | Matched in |",
      "|---|---|",
    );
    for (const [id, c] of Object.entries(item.clients.perClient)) {
      lines.push(`| ${id} | ${c.runs}/${item.runs} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

const fmtDist = (dist) =>
  Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .map(([v, c]) => `${v}: ${c}`)
    .join(", ");
