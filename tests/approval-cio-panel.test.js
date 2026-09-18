// Server-side render of ApprovalDashboard (via Vite's SSR loader, so JSX is
// transformed exactly as in the app — no new dependencies). Verifies the
// "แก้ไขโดย CIO" panel shows every change with the ORIGINAL AI text, the edit and
// the rationale, and that drafts without a review render no panel.
//
// Run: npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { cachedDemoRuns } from "../src/data/cachedDemoRun.js";

let vite;
let ApprovalDashboard;

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false, // the app config mounts dev API routes; not needed here
    plugins: [react()],
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  ApprovalDashboard = (await vite.ssrLoadModule("/src/components/ApprovalDashboard.jsx")).default;
});

after(async () => {
  await vite?.close();
});

// A pending draft shaped exactly like useDraft builds it from a cached entry.
function draftFrom(entry, { withReview }) {
  const analysis = withReview ? entry.reviewedAnalysis : entry.analysis;
  return {
    draftId: entry.newsId,
    status: "pending",
    newsSource: { headline: "Fed raises…", content: "…" },
    analysis,
    ...(withReview ? { aiAnalysis: entry.analysis, cioReview: entry.cioReview } : {}),
    affectedTickers: analysis.affected_tickers,
    affectedSectors: analysis.affected_sectors,
    sentiment: analysis.sentiment,
    reasoning: analysis.reasoning,
    dislocation: { detected: analysis.dislocation_detected, description: analysis.dislocation_description },
    agent2Result: entry.agent2Result,
    affectedClients: entry.affectedClients,
    reviewedBy: null,
    approvedAt: null,
  };
}

const render = (draft) =>
  renderToStaticMarkup(createElement(ApprovalDashboard, { draft, onApprove() {}, onReject() {} }));

test("CIO panel lists each change with original AI text, edited text and rationale", () => {
  const base = cachedDemoRuns.N007;
  const original = base.analysis.dislocation_description;
  const edited = "ฉบับที่ CIO แก้ไขแล้ว (ทดสอบ)";
  const entry = {
    ...base,
    cioReview: {
      reviewer: "CIO ทดสอบ",
      reviewedAt: "2026-09-18T03:00:00.000Z",
      changes: [
        { path: "dislocation_description", before: original, after: edited, rationale: "ตัดคำชี้นำการลงทุน" },
      ],
    },
    reviewedAnalysis: { ...base.analysis, dislocation_description: edited },
  };
  const html = render(draftFrom(entry, { withReview: true }));
  assert.ok(html.includes("แก้ไขโดย CIO"));
  assert.ok(html.includes("CIO ทดสอบ"));
  assert.ok(html.includes("คำอธิบาย Dislocation"));
  assert.ok(html.includes("ข้อความเดิมจาก AI"));
  assert.ok(html.includes("ข้อความหลัง CIO แก้ไข"));
  // Both versions must read as plain text — no strikethrough on the AI original.
  assert.ok(!/line-through/.test(html));
  assert.ok(html.includes(original), "original AI text still visible");
  assert.ok(html.includes(edited));
  assert.ok(html.includes("ตัดคำชี้นำการลงทุน"));
  assert.ok(html.includes("ผลตรวจนี้เป็นของต้นฉบับจาก AI"), "Agent 2 verdict labelled as the original's");
  assert.ok(html.includes("ฉบับที่ CIO ตรวจแก้แล้ว"), "hero marks the edited text");
});

test("no review -> no CIO panel (cached N006 and unreviewed N007)", () => {
  for (const id of ["N006", "N007"]) {
    const html = render(draftFrom(cachedDemoRuns[id], { withReview: false }));
    assert.ok(!html.includes("แก้ไขโดย CIO"), id);
    assert.ok(!html.includes("ผลตรวจนี้เป็นของต้นฉบับจาก AI"), id);
  }
});
