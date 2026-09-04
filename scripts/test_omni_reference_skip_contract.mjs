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
    include: [
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/generated-script-reference-selection.ts"),
      join(ui, "src/lib/server/omni/llm-prompt-chain-prompts.ts"),
      join(ui, "src/lib/server/omni/legacy-reels-url.ts"),
    ],
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
  const { normalizeLegacyReelsUrl } = require(findFile(compiled, "legacy-reels-url.js"));
  const { normalizeDirectorBrief } = require(findFile(compiled, "director-analysis-types.js"));
  const { buildDirectorSegmenterPrompt } = require(findFile(compiled, "llm-prompt-chain-prompts.js"));
  const sourceSelectorSource = readFileSync(join(ui, "src/lib/server/omni/generated-script-source.ts"), "utf8");
  assert.match(sourceSelectorSource, /omni_generated_script_source_cursors/u);
  assert.match(sourceSelectorSource, /omni_generated_script_source_attempts/u);
  assert.match(sourceSelectorSource, /ON CONFLICT \(project_id, product_id\)/u);
  assert.match(sourceSelectorSource, /\.\.\.attemptedIds/u);
  assert.equal(MAX_DIRECTOR_REFERENCE_ATTEMPTS, 16);
  assert.equal(
    normalizeLegacyReelsUrl("https://www.instagram.com/reels/DTaokiODjgF/?utm_source=test"),
    normalizeLegacyReelsUrl("https://www.instagram.com/reel/DTaokiODjgF"),
    "duplicate Instagram URLs must share one rotation key",
  );
  assert.notEqual(
    normalizeLegacyReelsUrl("https://www.instagram.com/reel/AbC"),
    normalizeLegacyReelsUrl("https://www.instagram.com/reel/abc"),
    "case-sensitive reel codes must stay distinct",
  );
  const resolveCalls = [];
  const warnings = [];
  const selected = legacyScenario(2930);
  const fallback = legacyScenario(2931);

  const resolved = await resolveReadyGeneratedScriptReference({
    projectId: 7,
    productId: 9,
    maxAttempts: 3,
    resolveSource: async (input) => {
      resolveCalls.push({ ...input, excludedLegacyScenarioIds: [...(input.excludedLegacyScenarioIds || [])] });
      assert.equal(input.legacyScenarioId, undefined);
      if (!input.excludedLegacyScenarioIds?.length) return { sourceScenario: selected, sourceMode: "round_robin_active_legacy_reference" };
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
    maxAttempts: 3,
    resolveSource: async (input) =>
      !input.excludedLegacyScenarioIds?.length
        ? { sourceScenario: invalidCompleted, sourceMode: "round_robin_active_legacy_reference" }
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
    maxAttempts: 3,
    resolveSource: async (input) =>
      !input.excludedLegacyScenarioIds?.length
        ? { sourceScenario: storageFailed, sourceMode: "round_robin_active_legacy_reference" }
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

  for (const failure of [
    { analysis: directorAnalysis(selected.id, "failed", "empty content"), reason: /empty content/u },
    { analysis: directorAnalysis(selected.id, "completed", null, { invalidBrief: true }), reason: /director analysis is invalid/u },
    { analysis: directorAnalysis(selected.id, "completed", null, { storageFailed: true }), reason: /Reference video download failed/u },
    { analysis: directorAnalysis(selected.id, "completed", null), reason: /неполный визуальный таймлайн/u, requireCompleteTimeline: true },
  ]) {
    let selectionCalls = 0;
    let rotationCalls = 0;
    await assert.rejects(() => resolveReadyGeneratedScriptReference({
      projectId: 7, productId: 9, legacyScenarioId: selected.id, maxAttempts: 3,
      requireCompleteTimeline: failure.requireCompleteTimeline,
      resolveSource: async (input) => {
        selectionCalls += 1;
        assert.equal(input.legacyScenarioId, selected.id);
        return { sourceScenario: selected, sourceMode: "selected_legacy_reference" };
      },
      onSourceAttempted: async () => { rotationCalls += 1; },
      shouldAnalyze: () => true,
      ensureAnalysis: async () => failure.analysis,
    }), (error) => {
      assert.match(error.message, failure.reason);
      assert.match(error.message, /Выбранный референс сохранён, другой источник не подставлен/u);
      return true;
    });
    assert.equal(selectionCalls, 1, "an explicitly selected source must not rotate after failure");
    assert.equal(rotationCalls, 0, "an explicit failure must not consume automatic rotation");
  }

  const incompleteTimelineWarnings = [];
  const resolvedWithTimeline = await resolveReadyGeneratedScriptReference({
    projectId: 7, productId: 9, requireCompleteTimeline: true,
    resolveSource: async (input) => ({
      sourceScenario: input.excludedLegacyScenarioIds?.length ? fallback : selected,
      sourceMode: "round_robin_active_legacy_reference",
    }),
    shouldAnalyze: () => true,
    ensureAnalysis: async ({ sourceScenario }) => directorAnalysis(sourceScenario.id, "completed", null, { completeTimeline: sourceScenario.id === fallback.id }),
    warn: (message) => incompleteTimelineWarnings.push(message),
  });
  assert.equal(resolvedWithTimeline.sourceScenario.id, fallback.id);
  assert.match(incompleteTimelineWarnings[0], /неполный визуальный таймлайн/u);

  const selectedWithTimeline = await resolveReadyGeneratedScriptReference({
    projectId: 7, productId: 9, legacyScenarioId: selected.id, requireCompleteTimeline: true,
    resolveSource: async () => ({ sourceScenario: selected, sourceMode: "selected_legacy_reference" }),
    shouldAnalyze: () => true,
    ensureAnalysis: async () => directorAnalysis(selected.id, "completed", null, { completeTimeline: true }),
  });
  assert.equal(selectedWithTimeline.sourceScenario.id, selected.id);
  await assert.rejects(() => resolveReadyGeneratedScriptReference({
    projectId: 7, productId: 9, legacyScenarioId: selected.id,
    resolveSource: async () => ({ sourceScenario: fallback, sourceMode: "round_robin_active_legacy_reference" }),
    shouldAnalyze: () => false,
    ensureAnalysis: async () => { throw new Error("must not run"); },
  }), /Другой источник не подставлен/u, "a resolver must not substitute a different explicitly selected reference");
  await assert.rejects(() => resolveReadyGeneratedScriptReference({
    projectId: 7, productId: 9, legacyScenarioId: selected.id, requireCompleteTimeline: true,
    resolveSource: async () => ({ sourceScenario: selected, sourceMode: "selected_legacy_reference" }),
    shouldAnalyze: () => false,
    ensureAnalysis: async () => { throw new Error("must not run"); },
  }), /неполный визуальный таймлайн/u, "strict preparation must not silently accept absent analysis");

  const incompleteTimeline = directorAnalysis(selected.id, "completed", null, { completeTimeline: true });
  incompleteTimeline.director_analysis_json.camera_timeline[0].start_sec = 2;
  await assert.rejects(() => resolveReadyGeneratedScriptReference({
    projectId: 7, productId: 9, requireCompleteTimeline: true,
    resolveSource: async () => ({ sourceScenario: selected, sourceMode: "selected_legacy_reference" }),
    shouldAnalyze: () => true,
    ensureAnalysis: async () => incompleteTimeline,
  }), /неполный визуальный таймлайн/u, "a selected source mode must stay selected even without an explicit ID argument");

  const contactBrief = validDirectorBrief(true);
  contactBrief.camera_timeline[0].action_description = "presenter holds and opens the original product";
  const promptScript = "Наш продукт помогает выбрать подходящий вариант каждый день.";
  const storyboardPrompt = buildDirectorSegmenterPrompt({
    chainInput: { productName: "Наш продукт", directorBrief: normalizeDirectorBrief(contactBrief), avatarSpeechGender: "male" },
    draft: { script: promptScript },
    segmentPlan: {
      segments: [{ index: 1, text: promptScript, wordCount: 9 }],
      segmentDurationsSeconds: [6],
    },
  });
  assert.match(storyboardPrompt, /SOURCE PRODUCT ADAPTATION: наш продукт показывается только в отдельном product_cutaway без аватара, людей и рук/u);
  assert.match(storyboardPrompt, /замени это действие предметной вставкой/u);
  assert.match(storyboardPrompt, /Сохрани сеттинг, свет, цвета, материал фона, крупность и характер камеры/u);
  assert.match(storyboardPrompt, /предметная вставка разрешена даже без исходного product_broll/u);
  assert.match(storyboardPrompt, /speech_mode=voiceover_only и reference_role=product, независимо от исходного on_camera/u);
  assert.doesNotMatch(storyboardPrompt, /product replacement допустим только в явно разрешенном source interval/u);
  assert.doesNotMatch(storyboardPrompt, /В segment с product_cutaway опиши одну непрерывную предметную B-roll композицию/u);

  const unrelatedToProduct = legacyScenario(2935);
  const analyzedIds = [];
  const attemptedIds = [];
  const resolvedAdvertisingReference = await resolveReadyGeneratedScriptReference({
    projectId: 7,
    productId: 9,
    maxAttempts: 3,
    resolveSource: async () => ({ sourceScenario: unrelatedToProduct, sourceMode: "round_robin_active_legacy_reference" }),
    onSourceAttempted: async (sourceScenario) => attemptedIds.push(sourceScenario.id),
    shouldAnalyze: () => true,
    ensureAnalysis: async ({ sourceScenario }) => {
      analyzedIds.push(sourceScenario.id);
      return directorAnalysis(sourceScenario.id, "completed", null);
    },
  });
  assert.equal(resolvedAdvertisingReference.sourceScenario.id, unrelatedToProduct.id);
  assert.deepEqual(attemptedIds, [unrelatedToProduct.id]);
  assert.deepEqual(analyzedIds, [unrelatedToProduct.id], "reference topic must not block a mid-roll product ad");

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
        : validDirectorBrief(options.completeTimeline)
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

function validDirectorBrief(completeTimeline = false) {
  return {
    visual_hook: { action: "presenter starts in a car", retention_trigger: "direct eye contact" },
    atmosphere: { mood: "casual", lighting: "daylight", color_grading: "natural", setting: "passenger seat" },
    clothing: { style: "dark knit top", color_palette: ["black"], fit_details: "fitted", source: "presenter", adaptation_notes: "adapt to avatar" },
    camera: { shot_types: ["medium close-up"], angles: ["eye level"], movements: ["handheld"], stabilization: "phone shake" },
    camera_timeline: completeTimeline ? [{
      start_sec: 0, end_sec: 8,
      shot_types: ["medium close-up"], angles: ["eye level"], movements: ["static"], stabilization: "stable",
      setting: "passenger seat", environment: "car interior", lighting: "daylight",
      action_description: "presenter talks to camera", actor_gesture: "small gesture", speech_mode: "on_camera",
    }] : [],
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
