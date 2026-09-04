import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ui = resolve(import.meta.dirname, "../ui");
const output = mkdtempSync(join(tmpdir(), "omni-avatar-broll-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const originalFetch = global.fetch;
const productName = "Коллаген";
const wardrobe = "синяя льняная рубашка с длинными рукавами";
const setting = "уютная гостиная с деревянным столом";
const light = "мягкий тёплый свет из окна справа";
const rawContact = "SOURCE_CONTACT_SENTINEL: presenter holds and opens the source product";
let semanticReviewCalls = 0;
let semanticPatchCalls = 0;
let semanticPatch;

try {
  global.fetch = async () => { throw new Error("Network calls are forbidden in this local regression"); };
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2022", module: "commonjs", moduleResolution: "node", strict: true,
      rootDir: join(ui, "src"), outDir: compiled,
      baseUrl: ui, paths: { "@/*": ["src/*"] },
      esModuleInterop: true, skipLibCheck: true,
      types: ["node"], typeRoots: [join(ui, "node_modules/@types")],
    },
    files: [
      "lib/server/omni/storyboard/omni-storyboard-renderer.ts",
      "lib/server/omni/omni-storyboard-image-prompt.ts",
      "lib/server/omni/omni-physical-repair-pipeline.ts",
      "lib/server/omni/omni-storyboard-semantic-repair.ts",
      "lib/server/omni/reference-segment-plan.ts",
      "lib/server/omni/director-layout-contract.ts",
    ].map((path) => join(ui, "src", path)),
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });
  mkdirSync(join(output, "node_modules/@"), { recursive: true });
  symlinkSync(join(compiled, "lib"), join(output, "node_modules/@/lib"), "dir");
  Module._load = function (name, ...args) {
    if (name === "./semantic-storyboard-memory") return {
      loadSemanticStoryboardMemory: async () => [], rememberSemanticStoryboardIssues: async () => {},
    };
    if (name === "./storyboard-plan-semantic-reviewer") return {
      reviewStoryboardPlanSemantics: async () => {
        semanticReviewCalls += 1;
        return {
          version: "storyboard-plan-semantic-review-v1", passed: semanticReviewCalls > 1,
          issues: semanticReviewCalls > 1 ? [] : [{ segmentIndex: 1, code: "meaning", explanation: "Уточнить жест финального ведущего" }],
          repairInstructions: semanticReviewCalls > 1 ? [] : ["Сохранить товарную вставку и уточнить финальный жест"],
        };
      },
    };
    if (name === "./omni-storyboard-semantic-llm") return {
      requestSemanticStoryboardJson: async () => { semanticPatchCalls += 1; return semanticPatch; },
    };
    return originalLoad.call(this, name, ...args);
  };
  const server = (path) => require(join(compiled, "lib/server/omni", path));
  const { normalizeDirectorBrief } = server("director-analysis-types.js");
  const { buildReferenceSegmentPlan, applyReferenceSegmentPlanToFrames, applyReferenceSegmentPlanToStoryboard } = server("reference-segment-plan.js");
  const { normalizePhysicalStoryboardSegment } = server("physical-storyboard-normalizer.js");
  const { normalizeOmniPromptPlanWithPhysicalRules } = server("omni-physical-repair-pipeline.js");
  const { renderCompactRussianOmniStoryboardPrompt } = server("storyboard/omni-storyboard-renderer.js");
  const { renderOmniStoryboardTimeline } = server("storyboard/omni-storyboard-timeline.js");
  const { buildStoryboardImagePrompt } = server("omni-storyboard-image-prompt.js");
  const { prepareOmniPromptPlanWithSemanticRepair } = server("omni-storyboard-semantic-repair.js");
  const { buildDirectorLayoutContract, applyDirectorLayoutToPlan } = server("director-layout-contract.js");
  const { buildReferenceTransferPolicy } = server("omni-reference-transfer-policy.js");
  Module._load = originalLoad;

  for (const durationSeconds of [4, 6, 8, 10]) {
    const storyboard = buildStoryboard(durationSeconds);
    const visibleByFrame = storyboard.frames.map((_, index) => index === 1);
    const brief = normalizeDirectorBrief(buildBrief(durationSeconds));
    const sourcePlan = buildReferenceSegmentPlan({ brief, segmentIndex: 1, segmentCount: 1, segmentSeconds: durationSeconds });
    const adaptedFrames = applyReferenceSegmentPlanToFrames(sourcePlan, storyboard.frames.map((frame, index) => ({
      role: index === 1 ? "product_cutaway" : index === 3 ? "environment_cutaway" : "face_open",
      action: frame.visualAction, camera: frame.camera, visualDescription: frame.environment,
    })), true, { productVisibleByFrame: visibleByFrame });
    assert.equal(adaptedFrames[1].role, "product_cutaway", "approved product B-roll must override source presenter role");
    assert.doesNotMatch(adaptedFrames[1].action, /SOURCE_CONTACT_SENTINEL/u);
    const hiddenSourcePlan = { ...sourcePlan, beats: sourcePlan.beats.map((beat) => ({ ...beat, sourceRole: "product_broll", speechMode: "voiceover_only", avatarAllowed: false, visibleSubjectRole: "object_only" })) };
    const hiddenFrames = applyReferenceSegmentPlanToFrames(hiddenSourcePlan, storyboard.frames.map(() => ({
      role: "product_cutaway", action: "штора слегка колышется у окна", camera: "общий план", visualDescription: setting,
    })), true, { productVisibleByFrame: visibleByFrame.map(() => false) });
    assert.ok(hiddenFrames.every((frame) => frame.role === "environment_cutaway"), "a false product mask must override the source product B-roll role");
    assert.ok(hiddenFrames.every((frame) => frame.action === "штора слегка колышется у окна"), "hidden source products must not overwrite approved thematic actions");
    const applied = applyReferenceSegmentPlanToStoryboard(sourcePlan, storyboard, true, { productVisibleByFrame: visibleByFrame });
    const normalized = normalizePhysicalStoryboardSegment({ storyboard: applied, productName, productVisible: true, productVisibleByFrame: visibleByFrame, referenceSceneMode: "presenter", productRole: "brief_demo" });
    assert.deepEqual(normalized.frames.map((frame) => frame.speechMode), storyboard.frames.map((frame) => frame.speechMode));
    assert.match(normalized.frames[1].visualAction, /без людей и рук/u);
    assert.doesNotMatch(normalized.frames[1].visualAction, /SOURCE_CONTACT_SENTINEL|holds|держит/u);

    const rendered = renderCompactRussianOmniStoryboardPrompt({ storyboard: normalized, directorBrief: brief, productName, productRole: "brief_demo" });
    assertTimedPrompt(rendered, normalized);
    for (const canonicalStoryboardReferenceUrl of [null, "https://example.test/canonical.png"]) {
      const imagePrompt = buildStoryboardImagePrompt({
        segmentIndex: 1, storyboard: normalized, productName, avatarReferenceUrl: "https://example.test/avatar.png",
        productReferenceUrls: ["https://example.test/product.png"], directorReferenceImageUrls: ["https://example.test/source.png"],
        canonicalStoryboardReferenceUrl, directorBrief: brief, referenceSegmentPlan: sourcePlan, productRole: "brief_demo",
      });
      const panels = imagePrompt.split("\n").filter((line) => /^Кадр \d+:/u.test(line));
      assert.equal(panels.length, normalized.frames.length);
      panels.forEach((panel, index) => {
        assert.ok(panel.includes(setting) && panel.includes(light), `panel ${index + 1} must preserve full environment and lighting`);
        if (index !== 1) assert.ok(panel.includes(wardrobe), `panel ${index + 1} wardrobe must not be truncated`);
      });
      assert.match(panels[1], /subject=product_only; avatar_allowed=false/u);
      assert.doesNotMatch(panels[1], /SOURCE_CONTACT_SENTINEL|holds/u);
      assert.doesNotMatch(imagePrompt, /preserve the referenceSegmentPlan's presenter|hard source-continuity/u);
    }

    const physical = normalizeOmniPromptPlanWithPhysicalRules({
      promptPlan: [buildPromptSegment(applied, sourcePlan, visibleByFrame)], productName, segmentCount: 1, directorBrief: brief, referenceSceneMode: "presenter",
    })[0];
    assertTimedPrompt(physical.prompt, physical.storyboardPlan);
    assert.doesNotMatch(physical.prompt, /SOURCE_CONTACT_SENTINEL|REFERENCE SHOT CONTRACT/u, "physical repair must not append raw source observations after approved timing");

    if (durationSeconds === 6) {
      semanticPatch = { segments: [{ index: 1, storyboardPlan: {
        ...physical.storyboardPlan,
        frames: physical.storyboardPlan.frames.map((_, index) => index === 2 ? { visualAction: "аватар продолжает говорить и спокойно кивает" } : {}),
      } }] };
      const semantic = (await prepareOmniPromptPlanWithSemanticRepair({
        projectId: 1, productId: 1, promptPlan: [physical], script: physical.voiceoverText, productName,
        productDescription: null, directorBrief: brief, referenceSceneMode: "presenter", referenceFormatMode: "continuous_story", model: "local-stub",
      }))[0];
      assert.equal(semanticPatchCalls, 1);
      assert.equal(semanticReviewCalls, 2);
      assert.deepEqual(semantic.creativePlan.productVisibleByFrame, [false, true, false], "semantic repair must allow return to avatar after the complete product sentence");
      assert.deepEqual(semantic.storyboardPlan.frames.map((frame) => frame.speechMode), ["on_camera", "voiceover_only", "on_camera"]);
      assertTimedPrompt(semantic.prompt, semantic.storyboardPlan);
      assert.doesNotMatch(semantic.prompt, /SOURCE_CONTACT_SENTINEL|REFERENCE SHOT CONTRACT/u);
    }
  }

  const repeatedStoryboard = buildStoryboard(10);
  repeatedStoryboard.frames = repeatedStoryboard.frames.map((frame, index, frames) => ({
    ...frames[0], spokenText: frame.spokenText,
    environment: index >= 3 ? "новое окружение и холодный свет" : frames[0].environment,
    camera: index >= 2 ? "новый крупный ракурс" : frames[0].camera,
  }));
  const repeatedTimeline = renderOmniStoryboardTimeline(repeatedStoryboard, productName);
  for (const value of [repeatedStoryboard.frames[0].visualAction, repeatedStoryboard.frames[0].camera, repeatedStoryboard.frames[0].environment, wardrobe, "новое окружение и холодный свет", "новый крупный ракурс"]) {
    assert.equal(repeatedTimeline.split(value).length - 1, 1, `each unchanged field should be stated once: ${value}`);
  }
  assert.match(repeatedTimeline, /Сохраняются: действие/u);
  assert.equal([...repeatedTimeline.matchAll(/^\[\d+-\d+s\]/gmu)].length, 5, "deduplication must preserve all intervals");

  for (const position of ["upper-right corner", "lower-left corner", "в правом нижнем углу"]) {
    const brief = normalizeDirectorBrief(buildBrief(6, position));
    const policy = buildReferenceTransferPolicy({ directorBrief: brief, hasProductReference: true });
    const layout = buildDirectorLayoutContract(brief, policy);
    assert.ok(layout);
    assert.ok(layout.layoutLine.includes(position), "observed avatar placement must override a lower-left preset");
    const layoutPlan = applyDirectorLayoutToPlan({ productRole: "brief_demo", beats: [{ action: "Текущая сцена", startSeconds: 0, endSeconds: 2 }] }, layout);
    assert.equal(layoutPlan.beats[0].action, "Текущая сцена", "global layout rules must not contaminate per-frame actions or product detection");
    assert.match(layout.layoutLine, /product B-roll panels show only the product/u);
    assert.doesNotMatch(JSON.stringify(layoutPlan), /whole segment|behind the same lower-left|product background behind/u);
    const storyboard = buildStoryboard(6);
    const sourcePlan = buildReferenceSegmentPlan({ brief, segmentIndex: 1, segmentCount: 1, segmentSeconds: 6 });
    const prompt = renderCompactRussianOmniStoryboardPrompt({ storyboard, directorBrief: brief, productName, productRole: "brief_demo" });
    assert.match(prompt, /Товарные B-roll показывай отдельным кадром без слоя аватара/u);
    const imagePrompt = buildStoryboardImagePrompt({
      segmentIndex: 1, storyboard, productName, avatarReferenceUrl: "https://example.test/avatar.png", productReferenceUrls: ["https://example.test/product.png"],
      directorBrief: brief, referenceSegmentPlan: sourcePlan,
    });
    assert.match(imagePrompt, /Product B-roll is a separate product-only panel without an avatar overlay/u);
    assert.match(imagePrompt.split("\n").find((line) => line.startsWith("Кадр 2:")), /avatar_allowed=false/u);
  }
  const timelinePlacementBrief = buildBrief(6);
  timelinePlacementBrief.camera_timeline[0].composition = "picture-in-picture speaker cutout at upper-right corner";
  const observedPlacement = normalizeDirectorBrief(timelinePlacementBrief);
  const observedLayout = buildDirectorLayoutContract(observedPlacement, buildReferenceTransferPolicy({ directorBrief: observedPlacement, hasProductReference: true }));
  assert.ok(observedLayout?.layoutLine.includes("upper-right corner"), "timeline composition is also an observed layout source");
  console.log("Avatar/B-roll timeline integration checks passed; provider and storage calls were stubbed");
} finally {
  Module._load = originalLoad;
  global.fetch = originalFetch;
  rmSync(output, { recursive: true, force: true });
}

function assertTimedPrompt(prompt, storyboard) {
  const times = [...prompt.matchAll(/^\[(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s\]/gmu)].map((match) => [+match[1], +match[2]]);
  assert.deepEqual(times, storyboard.frames.map((_, index) => [index * 2, (index + 1) * 2]));
  assert.equal(times.at(-1)[1], storyboard.durationSeconds);
  assert.equal(prompt.split(storyboard.voiceoverText).length - 1, 1, "full exact speech must appear once");
  assert.match(prompt, /не требует паузы каждые две секунды/u);
  assert.doesNotMatch(prompt, /(?:остановись|сделай паузу|пауза после каждой панели)/iu);
  assert.doesNotMatch(prompt, /SOURCE_CONTACT_SENTINEL/u);
  assert.match(prompt, /товарный B-roll/u);
  assert.match(prompt, /говорящий аватар/u);
  if (storyboard.frames.length >= 4) assert.match(prompt, /тематический B-roll/u);
}

function buildStoryboard(durationSeconds) {
  const chunks = ["Я раньше путался постоянно.", "Коллаген удобно хранить дома.", "Теперь утром порядок привычный.", "У окна лежит блокнот.", "Мне так намного проще."];
  return {
    segmentIndex: 1, durationSeconds, voiceoverText: chunks.slice(0, durationSeconds / 2).join(" "),
    frames: chunks.slice(0, durationSeconds / 2).map((spokenText, index) => ({
      spokenText, wardrobe, environment: `${setting}; ${light}`,
      visualAction: index === 1 ? "Коллаген стоит неподвижно на деревянном столе; без людей и рук" : index === 3 ? "штора у окна слегка колышется, рядом лежит блокнот" : "аватар спокойно говорит в объектив с небольшим жестом",
      camera: index === 1 ? "крупный предметный ракурс без людей и рук" : "средний план на уровне глаз",
      productPlacement: index === 1 ? "Коллаген стоит на устойчивом деревянном столе; без людей и рук" : "продукт вне кадра",
      speechMode: index === 1 || index === 3 ? "voiceover_only" : "on_camera",
      sfxNotes: "тихие звуки комнаты", effectNotes: null,
    })),
  };
}

function buildBrief(durationSeconds, pipPosition = null) {
  return {
    reference_subject_mode: "presenter", reference_format_mode: "continuous_story", reference_render_mode: "mixed", wardrobe_continuity: "stable",
    visual_hook: { action: pipPosition ? `picture-in-picture cutout speaker at ${pipPosition}` : "direct address", retention_trigger: "личное наблюдение" },
    atmosphere: { mood: "спокойная беседа", setting, lighting: light, color_grading: "естественные тёплые цвета" },
    clothing: { style: wardrobe, color_palette: ["синий"], fit_details: "длинные рукава", source: "reference" },
    camera: { shot_types: ["medium"], angles: ["eye level"], movements: ["static"], stabilization: "stable" },
    camera_timeline: Array.from({ length: durationSeconds / 2 }, (_, index) => ({
      start_sec: index * 2, end_sec: (index + 1) * 2, setting, environment: "деревянный стол и голубая стена", lighting: light,
      shot_types: [index === 1 ? "close-up" : "medium"], angles: ["eye level"], movements: ["static"], stabilization: "stable",
      action_description: index === 1 ? rawContact : index === 3 ? "curtain moves beside a notebook" : "presenter talks to camera",
      actor_gesture: index === 1 ? "holds source product" : "small gesture",
      speech_mode: index === 3 ? "voiceover_only" : "on_camera", source_role: index === 3 ? "environment_broll" : "presenter",
      visible_subject_role: index === 3 ? "no_people" : "primary_presenter", avatar_allowed: index !== 3,
    })),
    action_beats: [], montage_rhythm: { cut_pace: "natural", beat_sync: "speech", transition_style: ["hard cut"] },
    reusable_mechanics: { visual_mechanics: [pipPosition ? "picture-in-picture" : "direct address"], safe_zones_for_elements: pipPosition || "", looping_pattern: "return to face" },
  };
}

function buildPromptSegment(storyboardPlan, referenceSegmentPlan, productVisibleByFrame) {
  return {
    index: 1, role: "hook", prompt: `OLD PROMPT ${rawContact}`, referenceUrl: null,
    durationSeconds: storyboardPlan.durationSeconds, voiceoverText: storyboardPlan.voiceoverText, storyboardPlan,
    referenceSegmentPlan, storyboardValidation: null, creativeStrategy: {},
    creativePlan: { productRole: "brief_demo", productVisibleByFrame, beats: [] },
    validation: { valid: false, errors: ["stale_prompt"], warnings: [] },
  };
}
