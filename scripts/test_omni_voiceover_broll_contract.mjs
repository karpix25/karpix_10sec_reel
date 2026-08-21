import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-voiceover-broll-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);

function findFile(base, filename) {
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const path = join(base, entry.name);
    if (entry.isDirectory()) {
      try { return findFile(path, filename); } catch { /* continue */ }
    }
    if (entry.isFile() && entry.name === filename) return path;
  }
  throw new Error(`Could not find ${filename}`);
}

try {
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
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
      join(ui, "src/lib/omni/creative-contract.ts"),
      join(ui, "src/lib/server/omni/omni-reference-scene-mode.ts"),
      join(ui, "src/lib/server/omni/product-visual-profile.ts"),
      join(ui, "src/lib/server/omni/omni-life-formats.ts"),
      join(ui, "src/lib/server/omni/omni-visual-style-writer.ts"),
      join(ui, "src/lib/server/omni/omni-format-selector.ts"),
      join(ui, "src/lib/server/omni/digital-product-scene.ts"),
      join(ui, "src/lib/server/omni/omni-prompt-builder.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });

  const contract = findFile(compiled, "creative-contract.js");
  const alias = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(alias), { recursive: true });
  copyFileSync(contract, alias);

  const mode = require(findFile(compiled, "omni-reference-scene-mode.js"));
  const selector = require(findFile(compiled, "omni-format-selector.js"));
  const digital = require(findFile(compiled, "digital-product-scene.js"));
  const { buildOmniSegmentPrompts } = require(findFile(compiled, "omni-prompt-builder.js"));

  assert.equal(mode.resolveReferenceSceneMode({
    reference_subject_mode: "presenter",
    reference_format_mode: "voiceover_montage",
    reference_action_style: "voiceover montage with independent B-roll cutaways",
  }), "voiceover_broll");
  assert.equal(mode.isAvatarFreeReferenceScene("voiceover_broll"), false);
  const prompt = mode.applyReferenceSceneModeToOmniPrompt("CHARACTER: avatar. The avatar says: test", "voiceover_broll");
  assert.match(prompt, /VOICEOVER B-ROLL/iu);
  assert.match(prompt, /CHARACTER: avatar/iu);
  assert.doesNotMatch(prompt, /The avatar says/iu);

  const strategy = selector.selectOmniCreativeStrategy({
    script: "Покажу мобильное приложение Плати по миру. Артикул в описании.",
    firstSpokenLine: "Покажу мобильное приложение Плати по миру.",
    productName: "Плати по миру виртуальная карта",
    productDescription: "Мобильное приложение для виртуальной карты",
    targetAudience: "путешественники",
    hasProductReference: true,
    ctaMode: "article_in_description",
    referenceSceneMode: "voiceover_broll",
  });
  assert.equal(strategy.referenceSceneMode, "voiceover_broll");
  assert.equal(strategy.productRole, "digital_demo");
  assert.match(strategy.providerFormatDescription, /B-roll/iu);

  const digitalStep = digital.buildDigitalProductDemoStep({ productName: "Плати по миру", frameIndex: 3, frameCount: 5 });
  assert.match(digitalStep.action, /экран|смартфон/iu);
  assert.match(digitalStep.placement, /(?:не|без) пластиковой карты/iu);

  const voiceSegments = [
    "Покажу мобильное приложение Плати по миру для спокойных поездок без лишних банковских поисков и сложных переводов.",
    "Внутри приложения удобно проверить маршрут расходы и нужную сумму перед поездкой прямо со смартфона в дороге.",
    "Сохраните артикул Плати по миру в описании чтобы открыть подробности и сравнить условия перед следующей поездкой.",
  ].map((text, index) => ({ index: index + 1, text, wordCount: text.split(/\s+/u).length }));
  const prompts = buildOmniSegmentPrompts({
    generatedScript: {
      script: voiceSegments.map((segment) => segment.text).join(" "),
      source_snapshot: {},
    },
    legacyTranscript: null,
    product: {
      name: "Плати по миру виртуальная карта",
      description: "Мобильное приложение для виртуальной карты путешественника",
      product_reference_notes: "Утвержденный экран приложения на смартфоне.",
      product_visual_profile: { physical_form: "smartphone screen", prompt_summary: "approved product screen on a smartphone" },
      product_refs: [{ url: "https://example.com/product.png", kind: "image", is_primary: true }],
    },
    avatar: {
      display_name: "Anna",
      speech_gender: "female",
      prompt: "Friendly woman, realistic travel UGC style.",
      reference_url: "https://example.com/avatar.png",
      kie_character_id: "char_test",
    },
    segmentCount: 3,
    segmentSeconds: 10,
    voiceSegments,
    directorBrief: {
      reference_subject_mode: "voiceover_broll",
      reference_format_mode: "voiceover_montage",
      visual_hook: { action: "independent travel cutaways begin before speech", retention_trigger: "fast visual changes" },
      atmosphere: { mood: "natural", lighting: "daylight", color_grading: "natural", setting: "travel locations" },
      clothing: { style: "casual clothing", color_palette: ["neutral"], fit_details: "everyday fit", source: "B-roll subjects", adaptation_notes: "use visible clothing from each cut" },
      location_timeline: [{ start_sec: 0, end_sec: 30, setting: "travel locations", environment: "real places", lighting: "daylight" }],
      camera_timeline: [{ start_sec: 0, end_sec: 10, shot_types: ["wide"], angles: ["natural"], movements: ["handheld"], stabilization: "handheld", setting: "travel locations", environment: "real places", lighting: "daylight", action_description: "B-roll cutaway", actor_gesture: "walking" }],
      camera: { shot_types: ["wide"], angles: ["natural"], movements: ["handheld"], stabilization: "handheld" },
      montage_rhythm: { cut_pace: "quick", beat_sync: "speech beats", transition_style: ["hard cut"] },
      action_beats: [{ timestamp_sec: 0, action_description: "independent B-roll cutaway", actor_gesture: "natural movement" }],
      prop_sources: ["neutral travel props"],
      hand_object_interactions: [],
      motion_continuity: [],
      reference_action_style: "voiceover montage with independent B-roll cutaways",
      reusable_mechanics: { visual_mechanics: ["cut on claim"], safe_zones_for_elements: "", looping_pattern: "" },
      product_introduction: { first_appearance_sec: 0, relative_position: "never", introduction_style: "never shown", naturality_notes: "" },
      visual_transfer: { camera_composition: "wide natural framing", props: [], action_beats: [] },
    },
    targetAudience: "travelers",
    ctaMode: "article_in_description",
    recentFormatIds: [],
  });
  assert.equal(prompts[0].creativeStrategy.referenceSceneMode, "voiceover_broll");
  assert.ok(prompts.every((item) => item.creativePlan.productRole === "digital_demo" || item.creativePlan.productRole === "hidden"));
  assert.ok(prompts.every((item) => !/The avatar says:|герой говорит в камеру/iu.test(item.prompt)));
  assert.ok(prompts.every((item) => /CHARACTER:|главн(?:ый|ого) визуальн(?:ый|ого) героя/iu.test(item.prompt)));
  assert.ok(prompts.every((item) => /закадров|off-camera narrator/iu.test(item.prompt)));
  assert.ok(prompts.some((item) => /экран|смартфон/iu.test(item.storyboardPlan?.frames.map((frame) => frame.visualAction).join(" ") || "")));
  console.log("Omni voiceover B-roll contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
