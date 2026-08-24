import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

  const {
    MAX_DIRECTOR_REFERENCE_ATTEMPTS,
    resolveReadyGeneratedScriptReference,
  } = require(findFile(compiled, "generated-script-reference-selection.js"));
  const fitReviewerSource = readFileSync(join(ui, "src/lib/server/omni/reference-product-fit.ts"), "utf8");
  const sourceSelectorSource = readFileSync(join(ui, "src/lib/server/omni/generated-script-source.ts"), "utf8");
  assert.match(fitReviewerSource, /hook или обещание reference не получает ответа/u);
  assert.match(fitReviewerSource, /цены, бюджет, бронирование, туры, отели, билеты, транспорт, еда, покупки/u);
  assert.match(sourceSelectorSource, /omni_generated_script_source_cursors/u);
  assert.match(sourceSelectorSource, /ON CONFLICT \(project_id, product_id\)/u);
  assert.equal(MAX_DIRECTOR_REFERENCE_ATTEMPTS, 16);
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
      return { sourceScenario: fallback, sourceMode: "round_robin_active_legacy_reference" };
    },
    shouldAnalyze: () => true,
    ensureAnalysis: async ({ sourceScenario }) =>
      sourceScenario.id === selected.id
        ? directorAnalysis(sourceScenario.id, "failed", "Director analysis model returned empty content")
        : directorAnalysis(sourceScenario.id, "completed", null),
    warn: (message) => warnings.push(message),
  });

  assert.equal(resolved.sourceScenario.id, fallback.id);
  assert.equal(resolved.sourceMode, "round_robin_active_legacy_reference");
  assert.equal(resolveCalls.length, 2);
  assert.match(warnings[0], /source #2930/);
  assert.match(warnings[0], /empty content/);

  const invalidCompleted = legacyScenario(2934);
  const invalidWarnings = [];
  const resolvedAfterInvalidCompleted = await resolveReadyGeneratedScriptReference({
    projectId: 7,
    productId: 9,
    legacyScenarioId: invalidCompleted.id,
    maxAttempts: 3,
    resolveSource: async (input) =>
      input.legacyScenarioId
        ? { sourceScenario: invalidCompleted, sourceMode: "selected_legacy_reference" }
        : { sourceScenario: fallback, sourceMode: "round_robin_active_legacy_reference" },
    shouldAnalyze: () => true,
    ensureAnalysis: async ({ sourceScenario }) =>
      sourceScenario.id === invalidCompleted.id
        ? directorAnalysis(sourceScenario.id, "completed", null, { invalidBrief: true })
        : directorAnalysis(sourceScenario.id, "completed", null),
    warn: (message) => invalidWarnings.push(message),
  });
  assert.equal(resolvedAfterInvalidCompleted.sourceScenario.id, fallback.id);
  assert.match(invalidWarnings[0], /director analysis is invalid/);

  const storageWarnings = [];
  const storageFailed = legacyScenario(2932);
  const visualReady = legacyScenario(2933);
  const resolvedAfterStorageFailure = await resolveReadyGeneratedScriptReference({
    projectId: 7,
    productId: 9,
    legacyScenarioId: storageFailed.id,
    maxAttempts: 3,
    resolveSource: async (input) =>
      input.legacyScenarioId
        ? { sourceScenario: storageFailed, sourceMode: "selected_legacy_reference" }
        : { sourceScenario: visualReady, sourceMode: "round_robin_active_legacy_reference" },
    shouldAnalyze: () => true,
    ensureAnalysis: async ({ sourceScenario }) =>
      sourceScenario.id === storageFailed.id
        ? directorAnalysis(sourceScenario.id, "completed", null, { storageFailed: true })
        : directorAnalysis(sourceScenario.id, "completed", null),
    warn: (message) => storageWarnings.push(message),
  });

  assert.equal(resolvedAfterStorageFailure.sourceScenario.id, visualReady.id);
  assert.match(storageWarnings[0], /Reference video download failed/);

  const incompatible = legacyScenario(2935);
  const compatible = legacyScenario(2936);
  const analyzedIds = [];
  const attemptedIds = [];
  const fitWarnings = [];
  const resolvedAfterProductMismatch = await resolveReadyGeneratedScriptReference({
    projectId: 7,
    productId: 9,
    maxAttempts: 3,
    resolveSource: async (input) => {
      if (!input.excludedLegacyScenarioIds?.length) {
        return { sourceScenario: incompatible, sourceMode: "round_robin_active_legacy_reference" };
      }
      assert.deepEqual(input.excludedLegacyScenarioIds, [incompatible.id]);
      return { sourceScenario: compatible, sourceMode: "round_robin_active_legacy_reference" };
    },
    reviewProductFit: async (sourceScenario) => ({
      compatible: sourceScenario.id === compatible.id,
      reason: sourceScenario.id === compatible.id ? "travel payment need" : "unrelated travel law",
    }),
    onSourceAttempted: async (sourceScenario) => attemptedIds.push(sourceScenario.id),
    shouldAnalyze: () => true,
    ensureAnalysis: async ({ sourceScenario }) => {
      analyzedIds.push(sourceScenario.id);
      return directorAnalysis(sourceScenario.id, "completed", null);
    },
    warn: (message) => fitWarnings.push(message),
  });
  assert.equal(resolvedAfterProductMismatch.sourceScenario.id, compatible.id);
  assert.deepEqual(attemptedIds, [incompatible.id, compatible.id]);
  assert.deepEqual(analyzedIds, [compatible.id], "incompatible reference must be skipped before director analysis");
  assert.match(fitWarnings[0], /product-incompatible/);

  const handsOnly = legacyScenario(2937);
  const silentAvatar = legacyScenario(2938);
  const avatarWarnings = [];
  const resolvedAfterAvatarMismatch = await resolveReadyGeneratedScriptReference({
    projectId: 7,
    productId: 9,
    maxAttempts: 3,
    requireVisibleAvatar: true,
    resolveSource: async (input) => ({
      sourceScenario: input.excludedLegacyScenarioIds?.length ? silentAvatar : handsOnly,
      sourceMode: "round_robin_active_legacy_reference",
    }),
    shouldAnalyze: () => true,
    ensureAnalysis: async ({ sourceScenario }) => {
      const analysis = directorAnalysis(sourceScenario.id, "completed", null);
      analysis.director_analysis_json.visible_subject_policy = sourceScenario.id === handsOnly.id
        ? "hands_only"
        : "silent_avatar";
      return analysis;
    },
    warn: (message) => avatarWarnings.push(message),
  });
  assert.equal(resolvedAfterAvatarMismatch.sourceScenario.id, silentAvatar.id);
  assert.match(avatarWarnings[0], /avatar-incompatible/);

  await assert.rejects(
    () => resolveReadyGeneratedScriptReference({
      projectId: 7,
      productId: 9,
      maxAttempts: 2,
      resolveSource: async () => ({ sourceScenario: selected, sourceMode: "round_robin_active_legacy_reference" }),
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

function directorAnalysis(legacyScenarioId, status, error, options = {}) {
  const storedVideoUrl = status === "completed" && !options.storageFailed
    ? `https://s3.example.com/reference-${legacyScenarioId}.mp4`
    : null;
  return {
    id: legacyScenarioId,
    project_id: 7,
    product_id: 9,
    legacy_source: "old_db",
    legacy_scenario_id: legacyScenarioId,
    source_legacy_client_id: 1,
    original_reels_url: "https://example.com/reel",
    resolved_video_url: null,
    stored_video_url: storedVideoUrl,
    video_storage_status: options.storageFailed ? "failed" : storedVideoUrl ? "completed" : null,
    video_storage_error: options.storageFailed ? "Reference video download failed: 500" : null,
    source_snapshot: null,
    scrapecreators_payload: null,
    director_analysis_status: status,
    director_analysis_json: status === "completed"
      ? options.invalidBrief
        ? {}
        : validDirectorBrief()
      : null,
    analysis_verification: null,
    analysis_model: null,
    analysis_prompt_version: "director-brief-v3",
    analysis_error: error,
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
    completed_at: status === "completed" ? "2026-07-22T00:00:00.000Z" : null,
  };
}

function validDirectorBrief() {
  return {
    visual_hook: { action: "presenter starts in a car", retention_trigger: "direct eye contact" },
    atmosphere: { mood: "casual", lighting: "daylight", color_grading: "natural", setting: "passenger seat" },
    clothing: { style: "dark knit top", color_palette: ["black"], fit_details: "fitted", source: "presenter", adaptation_notes: "adapt to avatar" },
    camera: { shot_types: ["medium close-up"], angles: ["eye level"], movements: ["handheld"], stabilization: "phone shake" },
    montage_rhythm: { cut_pace: "slow", beat_sync: "none", transition_style: ["hard cut"] },
    reusable_mechanics: { visual_mechanics: ["direct address"], safe_zones_for_elements: "center", looping_pattern: "return to face" },
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
