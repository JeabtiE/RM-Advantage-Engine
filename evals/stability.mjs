// stability.mjs — Agent 1 prompt-stability eval. MAKES REAL API CALLS.
//
// WHY: Agent 1's per-sector directions have flipped between identical runs at
// temperature 0 (N006 healthcare positive vs neutral; N007 technology positive
// vs negative), and each flip changes which clients the RM would call. This
// measures how often that happens instead of guessing.
//
// WHAT IT DOES: calls Agent 1 (ONLY Agent 1 — never Agent 2 or Agent 3) N times
// per news item through the same transport the app uses (src/utils/claudeAPI.js
// -> /api/claude-agent), normalizes each result exactly as the endpoint does,
// runs the deterministic matcher on each, and writes raw output + metrics.
//
// IT NEVER TOUCHES THE DEMO CACHE: src/data/cachedDemoRun.js is not imported or
// written here. Use scripts/regenerateDemoCache.mjs for that, deliberately.
//
// HOW TO RUN (needs a server holding the key, e.g. `npm run dev` with
// ANTHROPIC_API_KEY and LIVE_AGENT_ENABLED=true in .env):
//   npm run eval:stability -- --items N006,N007,EVAL-CPN --runs 5 --max-calls 15
//
// Options:
//   --items <ids>      comma-separated mockNews ids and/or eval fixture ids
//   --runs <n>         runs per item (default 5)
//   --max-calls <n>    HARD CAP on real Anthropic calls; aborts before exceeding
//   --out <path>       results JSON (default evals/results/stability-<ts>.json)
//   --delay <ms>       pause between calls (default 1500) to stay off rate limits
//   --endpoint <url>   AGENT_ENDPOINT_BASE override (default http://localhost:5173)

import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { analyzeImpact } from "../src/utils/claudeAPI.js";
import { buildHoldingsSummary, findAffectedClients } from "../src/utils/matching.js";
import { mockNews } from "../src/data/mockNews.js";
import { itemMetrics, toMarkdown } from "./metrics.mjs";
import { MODEL, normalizeAgent1Output, heldSectorsFromSummary, heldTickersFromSummary } from "../api/claude-agent.js";

// isTransportError — did the request fail BEFORE the endpoint judged anything?
// Endpoint failures always carry a machine code ({ error: "<code>" } →
// err.code), e.g. response_truncated or invalid_model_output: those are the
// model/validation outcomes this eval is measuring, so they end the item and
// must never be retried (retrying would also skew the stability numbers).
// A transport failure (fetch rejected, proxy hiccup, a 5xx with no JSON body)
// has no code and says nothing about the model — production retries it inside
// claudeAPI/callClaude, so the eval retries it too rather than losing the item.
export function isTransportError(err) {
  return !err?.code;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, "results");
const FIXTURES_DIR = join(HERE, "fixtures");
const TEMPERATURE = 0; // what api/claude-agent.js sends; recorded in the report
// Transport retries per RUN (network/proxy failures only — see isTransportError).
// Each retry spends a call and counts against --max-calls.
const TRANSPORT_RETRIES = 1;

function parseArgs(argv) {
  const opts = { runs: 5, delay: 1500, items: [], maxCalls: null, out: null, endpoint: null };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    const value = inline ?? argv[++i];
    switch (flag) {
      case "--items": opts.items = String(value).split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--runs": opts.runs = Number(value); break;
      case "--max-calls": opts.maxCalls = Number(value); break;
      case "--out": opts.out = String(value); break;
      case "--delay": opts.delay = Number(value); break;
      case "--endpoint": opts.endpoint = String(value); break;
      default: die(`unknown option: ${flag}`);
    }
  }
  if (!opts.items.length) die("--items is required, e.g. --items N006,N007,EVAL-CPN");
  if (!Number.isInteger(opts.runs) || opts.runs < 1) die("--runs must be a positive integer");
  if (opts.maxCalls === null) die("--max-calls is required (hard cap on real API calls)");
  if (!Number.isInteger(opts.maxCalls) || opts.maxCalls < 1) die("--max-calls must be a positive integer");
  return opts;
}

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

// Eval fixtures stand in for news the repo does not carry (a single-company
// item): this phase must not add one to mockNews.js.
function loadFixtures() {
  const items = [];
  for (const file of readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"))) {
    const item = JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8"));
    items.push({ ...item, _source: `evals/fixtures/${file}` });
  }
  return items;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.endpoint) process.env.AGENT_ENDPOINT_BASE = opts.endpoint;
  process.env.AGENT_ENDPOINT_BASE ??= "http://localhost:5173";

  const pool = [...mockNews.map((n) => ({ ...n, _source: "src/data/mockNews.js" })), ...loadFixtures()];
  const selected = opts.items.map((id) => {
    const item = pool.find((n) => n.id === id);
    if (!item) die(`unknown item id "${id}" (mockNews + evals/fixtures: ${pool.map((n) => n.id).join(", ")})`);
    return item;
  });

  const planned = selected.length * opts.runs;
  if (planned > opts.maxCalls) {
    die(`plan needs ${planned} calls (${selected.length} items x ${opts.runs} runs) but --max-calls is ${opts.maxCalls}`);
  }

  const startedAt = new Date().toISOString();
  const holdingsSummary = buildHoldingsSummary();
  const held = {
    sectors: heldSectorsFromSummary(holdingsSummary),
    tickers: heldTickersFromSummary(holdingsSummary),
  };
  const outPath = opts.out ?? join(RESULTS_DIR, `stability-${startedAt.replace(/[:.]/g, "-")}.json`);

  console.log(`Agent 1 stability eval — ${selected.length} item(s) x ${opts.runs} run(s), cap ${opts.maxCalls} calls`);
  console.log(`  endpoint: ${process.env.AGENT_ENDPOINT_BASE}`);
  console.log(`  results:  ${outPath}`);

  let callsUsed = 0;
  const items = [];
  const notes = [];
  let failed = false;

  // Partial results are written on ANY failure — a half-finished run still
  // costs real money, so it must not be lost.
  const save = () => {
    mkdirSync(RESULTS_DIR, { recursive: true });
    // Completed runs are measured even when a later run failed — a partial run
    // still cost real calls, so its data is kept and labelled, not discarded.
    const metrics = items.map((it) =>
      it.outputs.length
        ? {
            ...itemMetrics({ newsId: it.newsId, outputs: it.outputs, clientSets: it.clientSets }),
            headline: it.headline,
            ...(it.error ? { error: it.error, incomplete: true } : {}),
          }
        : { newsId: it.newsId, headline: it.headline, error: it.error ?? "no runs completed", runs: 0 },
    );
    writeFileSync(
      outPath,
      JSON.stringify(
        { model: MODEL, temperature: TEMPERATURE, runs: opts.runs, startedAt, finishedAt: new Date().toISOString(), callsUsed, endpoint: process.env.AGENT_ENDPOINT_BASE, items, metrics, notes },
        null,
        2,
      ),
      "utf8",
    );
    writeFileSync(
      join(RESULTS_DIR, "latest.md"),
      toMarkdown({ model: MODEL, temperature: TEMPERATURE, runs: opts.runs, startedAt, items: metrics, callsUsed, notes }),
      "utf8",
    );
    return outPath;
  };

  for (const news of selected) {
    const record = { newsId: news.id, headline: news.headline, source: news._source, outputs: [], clientSets: [], raw: [], runInfo: [] };
    items.push(record);
    console.log(`\n─── ${news.id} — ${news.headline}`);
    for (let run = 1; run <= opts.runs; run++) {
      if (callsUsed >= opts.maxCalls) {
        record.error = `call cap ${opts.maxCalls} reached before run ${run}`;
        notes.push(`${news.id}: stopped at the ${opts.maxCalls}-call cap after ${record.outputs.length} run(s)`);
        failed = true;
        break;
      }
      let retries = 0;
      try {
        callsUsed++;
        process.stdout.write(`  run ${run}/${opts.runs} (call ${callsUsed}/${opts.maxCalls})… `);
        let returned;
        for (;;) {
          try {
            returned = await analyzeImpact(news, holdingsSummary);
            break;
          } catch (err) {
            // Transport failure: retry like production, if the cap allows.
            if (!isTransportError(err) || retries >= TRANSPORT_RETRIES) throw err;
            if (callsUsed >= opts.maxCalls) throw err;
            retries++;
            callsUsed++;
            process.stdout.write(`transport retry ${retries} (call ${callsUsed}/${opts.maxCalls})… `);
            await sleep(opts.delay);
          }
        }
        // The endpoint already normalized this; re-running is idempotent and
        // keeps the eval honest if it is ever pointed at a different server.
        const normalized = normalizeAgent1Output(returned, held.sectors, held.tickers);
        const clients = findAffectedClients(normalized).sort((a, b) => b.priorityScore - a.priorityScore);
        record.raw.push(returned);
        record.outputs.push(normalized);
        record.clientSets.push(clients.map((c) => c.clientId));
        // Response size is what truncation is about — record it per run so a
        // near-the-limit item is visible before it fails.
        record.runInfo.push({ run, retries, responseChars: JSON.stringify(returned).length });
        if (retries) notes.push(`${news.id}: run ${run} needed ${retries} transport retry/retries`);
        console.log(
          `scope=${normalized.event_scope ?? "-"} sentiment=${normalized.sentiment} ` +
            `dislocation=${!!normalized.dislocation_detected} clients=${clients.length} ` +
            `chars=${JSON.stringify(returned).length}`,
        );
      } catch (err) {
        console.log("FAILED");
        record.error = String(err?.message ?? err);
        notes.push(`${news.id}: run ${run} failed — ${record.error}`);
        failed = true;
        break;
      }
      if (run < opts.runs) await sleep(opts.delay);
    }
  }

  const written = save();
  console.log(`\nCalls used: ${callsUsed}/${opts.maxCalls}`);
  console.log(`Results:    ${written}`);
  console.log(`Summary:    ${join(RESULTS_DIR, "latest.md")}`);
  if (failed) {
    console.error("\n✗ eval incomplete — partial results saved above\n");
    process.exitCode = 1;
  }
}

// Importable for unit tests (isTransportError); only runs when executed directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
