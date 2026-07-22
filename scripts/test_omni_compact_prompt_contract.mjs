import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-compact-prompt-"));
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
    include: [join(ui, "src/lib/omni/**/*.ts"), join(ui, "src/lib/server/omni/**/*.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });
  const contractOutput = findFile(compiled, "creative-contract.js");
  const aliasContract = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(aliasContract), { recursive: true });
  copyFileSync(contractOutput, aliasContract);

  const { buildOmniSegmentPrompts } = require(findFile(compiled, "omni-prompt-builder.js"));
  const directorPrompts = buildOmniSegmentPrompts(buildInput("director_reference"));
  const avatarPrompts = buildOmniSegmentPrompts(buildInput("avatar_reference"));

  assert.ok(directorPrompts.every((item) => item.prompt.length < 5600), "provider prompts must stay compact");
  assert.ok(directorPrompts[0].prompt.includes("bright kitchen counter"));
  assert.ok(directorPrompts[1].prompt.includes("parked car interior"));
  assert.ok(directorPrompts[2].prompt.includes("bathroom mirror wall"));
  assert.ok(!directorPrompts.join("\n").includes("Fast jump-cut rhythm copied from reference"));
  assert.ok(!directorPrompts.join("\n").includes("REFERENCE EDITING:"));

  for (const item of directorPrompts) {
    assert.equal(countNormalized(item.prompt, item.voiceoverText), 1);
    assert.ok(item.prompt.includes("The avatar says:"));
    assert.ok(!item.prompt.includes(`"${item.voiceoverText}"`));
  }
  assert.ok(/WARDROBE:|Wardrobe:/u.test(directorPrompts[0].prompt));
  assert.ok(directorPrompts[0].prompt.includes("masculine version of the red summer dress"));
  assert.ok(avatarPrompts[0].prompt.includes("темно-синий худи"));
  assert.ok(avatarPrompts[0].prompt.includes("ignore clothing from the reference video"));
  assert.ok(!avatarPrompts.join("\n").includes("red summer dress"));

  console.log("Omni compact prompt contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function buildInput(wardrobeSource) {
  const voiceSegments = [
    "Этот крем быстро вписывается в утренний уход.",
    "Текстура легкая и не оставляет жирного блеска.",
    "Артикул можно найти в описании.",
  ];
  return {
    generatedScript: {
      id: 88,
      project_id: 1,
      product_id: 1,
      script: voiceSegments.join(" "),
      source_snapshot: { director_analysis: buildDirectorBrief() },
    },
    legacyTranscript: null,
    product: {
      id: 1,
      project_id: 1,
      name: "Крем",
      description: "Легкий крем для ежедневного ухода",
      product_reference_notes: "Белая баночка крема",
      avatar_reference_notes: "Мужчина, одежда: темно-синий худи и прямые джинсы.",
      product_refs: [{ id: "cream", url: "https://example.com/cream.png", kind: "image", role: "product_primary", is_primary: true }],
      avatar_refs: [],
      cta_mode: "article_in_description",
      cta_value: null,
    },
    avatar: {
      id: 1,
      project_id: 1,
      display_name: "Илья",
      prompt: "Мужчина 32 лет, одежда: темно-синий худи и прямые джинсы.",
      reference_url: "https://example.com/avatar.png",
      status: "approved",
      provider: "kie-omni",
      kie_character_id: "char_ilya",
      kie_character_status: "completed",
      kie_character_payload: null,
      is_active: true,
      created_at: "2026-07-22T00:00:00.000Z",
      updated_at: "2026-07-22T00:00:00.000Z",
    },
    segmentCount: 3,
    segmentSeconds: 8,
    voiceSegments: voiceSegments.map((text, index) => ({ index: index + 1, text, wordCount: text.split(/\s+/u).length })),
    brief: null,
    wardrobeSource,
    targetAudience: "уход за собой",
    ctaMode: "article_in_description",
    ctaValue: null,
    recentFormatIds: [],
  };
}

function buildDirectorBrief() {
  return {
    visual_hook: { action: "woman starts speaking while holding a jar", retention_trigger: "instant movement" },
    atmosphere: { mood: "warm casual", lighting: "soft window light", color_grading: "natural warm contrast", setting: "bright kitchen counter" },
    clothing: {
      style: "red summer dress",
      color_palette: ["red", "white"],
      fit_details: "light casual silhouette",
      source: "main presenter outfit style",
      adaptation_notes: "masculine version of the red summer dress: red casual shirt or overshirt, same light relaxed mood",
    },
    location_timeline: [
      { start_sec: 0, end_sec: 8, setting: "bright kitchen counter", environment: "cups and morning light", lighting: "soft window light" },
      { start_sec: 8, end_sec: 16, setting: "parked car interior", environment: "front seat, daylight through windshield", lighting: "soft daylight" },
      { start_sec: 16, end_sec: 24, setting: "bathroom mirror wall", environment: "sink edge and towel rail", lighting: "neutral bathroom light" },
    ],
    camera: { shot_types: ["medium close-up"], angles: ["eye-level"], movements: ["small handheld push"], stabilization: "handheld but readable" },
    montage_rhythm: { cut_pace: "Fast jump-cut rhythm copied from reference", beat_sync: "cuts on every pause", transition_style: ["hard cut"] },
    action_beats: [{ timestamp_sec: 0, action_description: "holds jar near chest", actor_gesture: "small hand gesture" }],
    prop_sources: [],
    hand_object_interactions: ["hand touches jar"],
    motion_continuity: ["jar stays physically in hand"],
    reference_action_style: "talking head with product insert",
    reusable_mechanics: { visual_mechanics: ["starts mid-action"], safe_zones_for_elements: "", looping_pattern: "" },
  };
}

function countNormalized(value, needle) {
  return normalize(value).split(normalize(needle)).length - 1;
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
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
