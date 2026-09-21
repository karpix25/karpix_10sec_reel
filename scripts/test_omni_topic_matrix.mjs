import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-topic-matrix-"));
const dist = join(output, "dist");
const require = createRequire(import.meta.url);

try {
  writeFileSync(
    join(output, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        skipLibCheck: true,
        strict: true,
        esModuleInterop: true,
        module: "commonjs",
        moduleResolution: "node",
        resolveJsonModule: true,
        isolatedModules: false,
        incremental: false,
        outDir: "dist",
        baseUrl: ui,
        paths: { "@/*": ["src/*"] },
      },
      include: [
        join(ui, "src/lib/server/omni/omni-topic-matrix.ts"),
        join(ui, "src/lib/server/omni/omni-product-topic-axes.ts"),
      ],
    })
  );
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["-p", join(output, "tsconfig.json")], {
    cwd: ui,
    stdio: "inherit",
  });

  const dbStubPath = join(output, "db-stub.js");
  writeFileSync(
    dbStubPath,
    'module.exports = { query: async () => { throw new Error("DB forbidden in matrix test"); }, connect: async () => { throw new Error("DB forbidden in matrix test"); } };'
  );
  const nodeModule = require("node:module");
  const originalResolveFilename = nodeModule._resolveFilename;
  nodeModule._resolveFilename = function (request, ...args) {
    if (request === "@/lib/db") return dbStubPath;
    return originalResolveFilename.call(this, request, ...args);
  };
  let matrixModule, axesModule;
  try {
    matrixModule = require(findFile(dist, "omni-topic-matrix.js"));
    axesModule = require(findFile(dist, "omni-product-topic-axes.js"));
  } finally {
    nodeModule._resolveFilename = originalResolveFilename;
  }

  // ---- axes normalization ----
  const { normalizeTopicAxes, buildTopicAxesPrompt } = axesModule;
  const axes = normalizeTopicAxes(JSON.stringify({
    benefits: [
      { title: "мгновенный выпуск карты", detail: "карта готова за пару минут прямо в телеграме" },
      { title: "оплата за границей", detail: "работает там, где российские карты не принимают" },
      { title: "", detail: "пустая выгода отбрасывается" },
    ],
    audiences: [
      { title: "путешественники", concern: "нельзя забронировать отель российской картой" },
      { title: "фрилансеры", concern: "платить за подписки и сервисы" },
    ],
    objections: ["это незаконно", "комиссии съедят всё"],
    use_cases: ["поездка на выходные", "оплата хостинга"],
  }));
  assert.equal(axes.benefits.length, 2, "empty benefit dropped");
  assert.equal(axes.audiences.length, 2);
  assert.throws(() => normalizeTopicAxes('{"benefits":[],"audiences":[]}'), /at least 2/, "thin axes rejected");
  const axesPrompt = buildTopicAxesPrompt({ name: "Карта", description: "виртуальная карта", notes: null, visual_summary: null, physical_contract: null });
  assert.ok(axesPrompt.includes("КАРТОЧКА ПРОДУКТА") && axesPrompt.includes("не выдумывай свойства"));

  // ---- matrix cells ----
  const { buildMatrixCells, pickMatrixProposals, matrixUsageFromRows, TOPIC_CELL_COOLDOWN_DAYS } = matrixModule;
  const frames = [
    { id: "hook-problem-solution", title: "Крючок", description: "", structure: ["a"], source: "builtin" },
    { id: "contrast-before-after", title: "Контраст", description: "", structure: ["b"], source: "builtin" },
    { id: "mistake-breakdown", title: "Ошибки", description: "", structure: ["c"], source: "builtin" },
  ];
  const cells = buildMatrixCells(axes, frames);
  assert.equal(cells.length, 2 * 2 * 3, "cells = benefits x audiences x frames");
  assert.equal(new Set(cells.map((cell) => cell.signature)).size, cells.length, "signatures unique");

  // ---- proposals: unused first, usage excluded by cooldown ----
  const empty = pickMatrixProposals({ cells, usage: new Map(), limit: 5 });
  assert.equal(empty.length, 5);
  const now = new Date("2026-09-21T12:00:00Z");
  const usage = new Map([
    [cells[0].signature, { lastUsedAt: new Date("2026-09-20T12:00:00Z"), timesUsed: 1 }],
  ]);
  const proposals = pickMatrixProposals({ cells, usage, limit: 4, now });
  assert.ok(!proposals.some((cell) => cell.signature === cells[0].signature), "fresh cell (1 day ago) is cooled down");
  const staleOnly = new Map(cells.map((cell) => [cell.signature, { lastUsedAt: new Date("2026-09-20T12:00:00Z"), timesUsed: 1 }]));
  staleOnly.set(cells[1].signature, { lastUsedAt: new Date("2026-08-01T12:00:00Z"), timesUsed: 3 });
  const staleProposals = pickMatrixProposals({ cells, usage: staleOnly, limit: 3, now });
  assert.ok(staleProposals.some((cell) => cell.signature === cells[1].signature), "stale cell (2 months ago) returns when fresh pool is empty");
  const audiencesInRow = proposals.slice(0, 3).map((cell) => cell.audienceTitle);
  assert.ok(new Set(audiencesInRow).size >= 2, "audiences rotate across consecutive proposals");
  const benefitsInRow = proposals.slice(0, 4).map((cell) => cell.benefitTitle);
  assert.ok(new Set(benefitsInRow).size >= 2, "benefits rotate across consecutive proposals");
  const framesInRow = proposals.slice(0, 6).map((cell) => cell.frameId);
  assert.ok(new Set(framesInRow).size >= 3, "frames rotate across consecutive proposals");

  // everything cooled down -> fall back to oldest reuse instead of empty list
  const allFresh = new Map(cells.map((cell, index) => [cell.signature, { lastUsedAt: new Date(now.getTime() - 86_400_000 * (index + 1)), timesUsed: 1 }]));
  const fallback = pickMatrixProposals({ cells, usage: allFresh, limit: 3, now });
  assert.equal(fallback.length, 3, "exhausted cooldown still yields oldest cells");
  assert.equal(TOPIC_CELL_COOLDOWN_DAYS, 21);

  // ---- usage from saved script rows ----
  const parsed = matrixUsageFromRows([
    { matrix_cell: { signature: "a::b::c" }, created_at: "2026-09-01T10:00:00Z" },
    { matrix_cell: { signature: "a::b::c" }, created_at: "2026-09-05T10:00:00Z" },
    { matrix_cell: null, created_at: "2026-09-06T10:00:00Z" },
  ]);
  assert.equal(parsed.size, 1);
  assert.equal(parsed.get("a::b::c").timesUsed, 2);
  assert.equal(parsed.get("a::b::c").lastUsedAt.toISOString(), "2026-09-05T10:00:00.000Z");

  console.log("Omni topic matrix checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: false })) {
    if (typeof entry === "string" && entry.endsWith(name)) {
      return join(dir, entry);
    }
  }
  throw new Error(`compiled file not found: ${name}`);
}
