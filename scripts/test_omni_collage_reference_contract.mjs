import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-collage-prompt-"));
const compiled = join(output, "compiled");
const tsconfig = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);
const originalFetch = global.fetch;
const RAW_FILMING_SUPPORT_PATTERN = /Fixed phone or tripod|Tripod or gimbal|Fixed mount or tripod|locked-off tripod/iu;

try {
  global.fetch = async () => { throw new Error("Network calls are forbidden in this local regression"); };
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
      join(ui, "src/lib/audio-library/moods.ts"),
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/**/*.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });
  const contractOutput = findFile(compiled, "creative-contract.js");
  const aliasContract = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(aliasContract), { recursive: true });
  copyFileSync(contractOutput, aliasContract);
  const moodsOutput = findFile(compiled, "moods.js");
  const aliasMoods = join(output, "node_modules", "@", "lib", "audio-library", "moods.js");
  mkdirSync(dirname(aliasMoods), { recursive: true });
  copyFileSync(moodsOutput, aliasMoods);

  const { buildOmniSegmentPrompts } = require(findFile(compiled, "omni-prompt-builder.js"));
  const input = buildReel50LikeInput();

  process.env.OMNI_PROVIDER_PROMPT_STYLE = "simple_full_body";
  const prompts = buildOmniSegmentPrompts(input);
  if (process.env.PRINT_COLLAGE_PROMPT_SUMMARY === "1") console.log(JSON.stringify(prompts, null, 2));
  delete process.env.OMNI_PROVIDER_PROMPT_STYLE;

  const { buildStoryboardImagePrompt } = require(findFile(compiled, "omni-storyboard-image-prompt.js"));
  const promptSizes = [];
  assert.equal(prompts.length, 3);
  for (const item of prompts) {
    assert.ok(item.validation.valid, JSON.stringify(item.validation));
    assert.equal(item.prompt.split(item.voiceoverText).length - 1, 1, "the full exact voiceover must appear once");
    assert.deepEqual([...item.prompt.matchAll(/^\[(\d+)-(\d+)s\]/gmu)].map((match) => [+match[1], +match[2]]), [[0, 2], [2, 4], [4, 6]]);
    assert.deepEqual(item.creativePlan.productVisibleByFrame, [false, true, false]);
    assert.equal(item.referenceUrl, "https://example.com/orange-collagen.png");
    assert.match(item.prompt, /@product_file/u);
    assert.match(item.prompt, /Товарные B-roll показывай отдельным кадром без слоя аватара/u);
    assert.match(item.prompt, /No visible filming gear/u);
    assert.doesNotMatch(item.prompt, RAW_FILMING_SUPPORT_PATTERN);
    assert.doesNotMatch(item.prompt, /SOURCE_CONTACT_SENTINEL|holds a blue bottle|REFERENCE SHOT CONTRACT/u);
    assert.doesNotMatch(item.prompt, /lower-left|whole segment.*avatar|background behind the same/u);
    assert.match(item.prompt, /не требует паузы каждые две секунды/u);
    const frames = item.storyboardPlan.frames;
    assert.deepEqual(frames.map((frame) => frame.speechMode), ["on_camera", "voiceover_only", "on_camera"]);
    for (const index of [0, 2]) {
      assert.match(frames[index].camera, /lower-right corner/u);
      assert.match(frames[index].wardrobe, /Pale blue|pale blue/iu);
      assert.ok(frames[index].physicalPlan.visibleEntityIds.every((id) => !id.startsWith("product:")), "global layout and negated product cues must not make the product physically visible");
    }
    for (const frame of frames) {
      assert.match(frame.environment, /светлая студия/u);
      assert.match(frame.environment, /мягкий свет справа/u);
    }
    assert.match(frames[1].visualAction, /без людей и рук/u);
    const imagePrompt = buildStoryboardImagePrompt({
      segmentIndex: item.index, storyboard: item.storyboardPlan, productName: input.product.name,
      avatarReferenceUrl: input.avatar.reference_url, productReferenceUrls: [input.product.product_refs[0].url],
      directorReferenceImageUrls: ["https://example.com/source.jpg"],
      canonicalStoryboardReferenceUrl: item.index > 1 ? "https://example.com/canonical.jpg" : null,
      directorBrief: input.generatedScript.source_snapshot.director_analysis,
      referenceSegmentPlan: item.referenceSegmentPlan,
    });
    assert.match(imagePrompt, /Product B-roll is a separate product-only panel without an avatar overlay/u);
    assert.match(imagePrompt, /lower-right corner/u);
    assert.doesNotMatch(imagePrompt, /lower-left|SOURCE_CONTACT_SENTINEL|holds a blue bottle/u);
    const panels = imagePrompt.split("\n").filter((line) => /^Кадр \d+:/u.test(line));
    assert.equal(panels.length, 3);
    assert.match(panels[1], /subject=product_only; avatar_allowed=false/u);
    panels.forEach((panel, index) => {
      assert.ok(panel.includes(frames[index].environment), "full source setting and lighting must reach every panel");
      if (index !== 1) assert.ok(panel.includes(frames[index].wardrobe), "presenter panels must preserve reference wardrobe");
    });
    promptSizes.push({ segment: item.index, video: item.prompt.length, image: imagePrompt.length });
  }
  console.log("Collage prompt sizes:", promptSizes);
  assert.ok(promptSizes.every((size) => size.video < 5600), "full-reference video prompts should remain under the compact 5600 character budget");
  assert.ok(promptSizes.every((size) => size.image < 5600), "three full-reference PiP image panels should remain under 5600 characters with their full setting, wardrobe and layout");

  console.log("Omni collage reference contract checks passed");
} finally {
  global.fetch = originalFetch;
  rmSync(output, { recursive: true, force: true });
  delete process.env.OMNI_PROVIDER_PROMPT_STYLE;
}

function buildReel50LikeInput() {
  const voiceSegments = [
    "Раньше я теряла покупки. Коллаген стоит рядом дома. Теперь порядок сохраняется дольше.",
    "Утром всё находится быстро. Коллаген хранится возле окна. Мне так намного проще.",
    "Я спокойно сравнила варианты. Этот коллаген стоит дома. Артикул указан в описании.",
  ];
  return {
    generatedScript: {
      id: 54,
      project_id: 6,
      product_id: 6,
      script: voiceSegments.join(" "),
      source_snapshot: {
        director_analysis: buildCollageDirectorBrief(),
      },
    },
    legacyTranscript: null,
    product: {
      id: 6,
      project_id: 6,
      name: "Коллаген",
      description: "Апельсиновый коллаген, желеобразное",
      product_reference_notes: null,
      avatar_reference_notes: null,
      product_refs: [{
        id: "collagen-product",
        url: "https://example.com/orange-collagen.png",
        kind: "image",
        role: "product_primary",
        is_primary: true,
      }],
      avatar_refs: [],
      cta_mode: "article_in_description",
      cta_value: null,
    },
    avatar: {
      id: 6,
      project_id: 6,
      display_name: "Героиня",
      speech_gender: "female",
      prompt: "европейская Девушка 30 лет в домашней обстановке",
      reference_url: "https://example.com/avatar.jpg",
      status: "approved",
      provider: "kie-omni",
      kie_character_id: "ae9e35d74fe44622bab11fbcdcb4b193",
      kie_character_status: "completed",
      kie_character_payload: null,
      is_active: true,
      created_at: "2026-07-15T00:00:00.000Z",
      updated_at: "2026-07-15T00:00:00.000Z",
    },
    segmentCount: 3,
    segmentSeconds: 6,
    segmentDurationsSeconds: [6, 6, 6],
    voiceSegments: voiceSegments.map((text, index) => ({ index: index + 1, text, wordCount: 12 })),
    brief: null,
    targetAudience: "женщины, уход за собой",
    ctaMode: "article_in_description",
    ctaValue: null,
    recentFormatIds: [],
  };
}

function buildCollageDirectorBrief() {
  return {
    reference_subject_mode: "presenter", reference_format_mode: "continuous_story", reference_render_mode: "mixed", wardrobe_continuity: "stable",
    visual_hook: { action: "picture-in-picture speaker in the lower-right corner", retention_trigger: "личное наблюдение" },
    atmosphere: { mood: "спокойная беседа", setting: "светлая студия", lighting: "мягкий свет справа", color_grading: "естественные цвета" },
    clothing: { style: "Pale blue linen blouse", fit_details: "long sleeves", color_palette: ["Pale blue"], source: "reference" },
    camera: { shot_types: ["medium close-up"], angles: ["eye level"], movements: ["static"], stabilization: "Fixed mount or tripod" },
    camera_timeline: Array.from({ length: 9 }, (_, index) => ({
      start_sec: index * 2, end_sec: (index + 1) * 2,
      setting: "светлая студия", environment: "деревянная полка и светлая стена", lighting: "мягкий свет справа",
      shot_types: ["medium close-up"], angles: ["eye level"], movements: ["static"], stabilization: "Fixed mount or tripod",
      composition: "picture-in-picture speaker at lower-right corner",
      action_description: index % 3 === 1 ? "SOURCE_CONTACT_SENTINEL: presenter holds a blue bottle" : "presenter speaks to camera",
      actor_gesture: index % 3 === 1 ? "holds a blue bottle" : "small head movement",
      source_role: "presenter", speech_mode: "on_camera", visible_subject_role: "primary_presenter", avatar_allowed: true,
    })),
    montage_rhythm: { cut_pace: "cuts between thoughts", beat_sync: "speech", transition_style: ["hard cuts"] },
    action_beats: [],
    reusable_mechanics: { visual_mechanics: ["picture-in-picture"], safe_zones_for_elements: "lower-right corner", looping_pattern: "return to face" },
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
