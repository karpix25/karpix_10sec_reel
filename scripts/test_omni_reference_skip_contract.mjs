import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-reference-skip-"));
const compiled = join(output, "compiled");
const tsconfig = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      baseUrl: join(ui, "src"),
      paths: { "@/*": ["*"] },
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: [join(ui, "src/lib/omni/**/*.ts"), join(ui, "src/lib/server/omni/generated-script-reference-selection.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });
  const typesOutput = findFile(compiled, "types.js");
  const aliasTypes = join(output, "node_modules", "@", "lib", "omni", "types.js");
  mkdirSync(dirname(aliasTypes), { recursive: true });
  copyFileSync(typesOutput, aliasTypes);

  const { resolveReadyGeneratedScriptReference } = require(findFile(compiled, "generated-script-reference-selection.js"));
  const resolveCalls = [];
  const warnings = [];
  const selected = legacyScenario(2930);
  const fallback = legacyScenario(2931);

  const resolved = await resolveReadyGeneratedScriptReference({
    projectId: 7,
    productId: 9,
    legacyScenarioId: selected.id,
    maxAttempts: 3,
    resolveSource: async (input) => {
      resolveCalls.push({ ...input, excludedLegacyScenarioIds: [...(input.excludedLegacyScenarioIds || [])] });
      if (input.legacyScenarioId) return { sourceScenario: selected, sourceMode: "selected_legacy_reference" };
      assert.deepEqual(input.excludedLegacyScenarioIds, [2930]);
      return { sourceScenario: fallback, sourceMode: "random_active_legacy_reference" };
    },
    shouldAnalyze: () => true,
    ensureAnalysis: async ({ sourceScenario }) =>
      sourceScenario.id === selected.id
        ? directorAnalysis(sourceScenario.id, "failed", "Director analysis model returned empty content")
        : directorAnalysis(sourceScenario.id, "completed", null),
    warn: (message) => warnings.push(message),
  });

  assert.equal(resolved.sourceScenario.id, fallback.id);
  assert.equal(resolved.sourceMode, "random_active_legacy_reference");
  assert.equal(resolveCalls.length, 2);
  assert.match(warnings[0], /source #2930/);
  assert.match(warnings[0], /empty content/);

  await assert.rejects(
    () => resolveReadyGeneratedScriptReference({
      projectId: 7,
      productId: 9,
      maxAttempts: 2,
      resolveSource: async () => ({ sourceScenario: selected, sourceMode: "random_active_legacy_reference" }),
      shouldAnalyze: () => true,
      ensureAnalysis: async ({ sourceScenario }) =>
        directorAnalysis(sourceScenario.id, "failed", "Director analysis model returned empty content"),
    }),
    /Не удалось подобрать рабочий reference video после 2 попыток/
  );

  console.log("Omni reference skip contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function legacyScenario(id) {
  return {
    id,
    client_id: 1,
    script: "Тестовый сценарий для reference.",
    title: "test",
    topic: "test",
    created_at: "2026-07-22T00:00:00.000Z",
    source_reference: `source_content:${id}`,
    legacy_client_name: "legacy",
    legacy_product_keyword: "product",
    reels_url: "https://example.com/reel",
    word_count: 4,
    duration_seconds: 8,
  };
}

function directorAnalysis(legacyScenarioId, status, error) {
  return {
    id: legacyScenarioId,
    project_id: 7,
    product_id: 9,
    legacy_source: "old_db",
    legacy_scenario_id: legacyScenarioId,
    source_legacy_client_id: 1,
    original_reels_url: "https://example.com/reel",
    resolved_video_url: null,
    stored_video_url: null,
    video_storage_status: null,
    video_storage_error: null,
    source_snapshot: null,
    scrapecreators_payload: null,
    director_analysis_status: status,
    director_analysis_json: status === "completed" ? {} : null,
    analysis_model: null,
    analysis_prompt_version: "director-brief-v3",
    analysis_error: error,
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
    completed_at: status === "completed" ? "2026-07-22T00:00:00.000Z" : null,
  };
}

function findFile(dir, fileName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      try {
        return findFile(path, fileName);
      } catch {
        continue;
      }
    }
    if (entry.name === fileName) return path;
  }
  throw new Error(`Could not find ${fileName} in ${dir}`);
}
