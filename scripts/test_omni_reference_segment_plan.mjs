import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-reference-segment-plan-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);

function findFile(base, filename) {
  const queue = [base];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      if (entry.isFile() && entry.name === filename) return fullPath;
    }
  }
  throw new Error(`File ${filename} not found in ${base}`);
}

const brief = {
  reference_subject_mode: "presenter",
  reference_format_mode: "continuous_story",
  reference_render_mode: "talking_head",
  reference_motion_mode: "continuous_motion",
  visual_hook: { action: "starts speaking", retention_trigger: "direct address" },
  atmosphere: { mood: "calm", lighting: "soft daylight", color_grading: "neutral", setting: "home" },
  clothing: { style: "casual", color_palette: ["blue"], fit_details: "simple", source: "reference" },
  camera: { shot_types: ["medium shot"], angles: ["eye level"], movements: ["static"], stabilization: "stable" },
  camera_timeline: [
    { start_sec: 0, end_sec: 10, shot_types: ["medium shot"], angles: ["eye level"], movements: ["static"], stabilization: "stable", setting: "home", environment: "window", lighting: "soft daylight", action_description: "speaks to camera", actor_gesture: "small hand gesture", speech_mode: "on_camera" },
    { start_sec: 10, end_sec: 20, shot_types: ["close-up"], angles: ["eye level"], movements: ["slow push-in"], stabilization: "stable", setting: "kitchen", environment: "counter", lighting: "warm light", action_description: "shows an object", actor_gesture: "raises object", speech_mode: "on_camera" },
  ],
  location_timeline: [
    { start_sec: 0, end_sec: 10, setting: "home", environment: "window", lighting: "soft daylight" },
    { start_sec: 10, end_sec: 20, setting: "kitchen", environment: "counter", lighting: "warm light" },
  ],
  montage_rhythm: { cut_pace: "medium", beat_sync: "speech", transition_style: ["hard cut"] },
  action_beats: [
    { timestamp_sec: 4, action_description: "speaks to camera", actor_gesture: "small hand gesture" },
    { timestamp_sec: 14, action_description: "shows an object", actor_gesture: "raises object" },
  ],
  prop_sources: [],
  hand_object_interactions: [],
  motion_continuity: ["stable identity"],
  reference_action_style: "natural",
  reusable_mechanics: { visual_mechanics: ["direct address"], safe_zones_for_elements: "center", looping_pattern: "none" },
};

try {
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      baseUrl: ui,
      paths: { "@/*": ["src/*"] },
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      skipLibCheck: true,
    },
    files: [join(ui, "src/lib/server/omni/reference-segment-plan.ts"), join(ui, "src/lib/audio-library/moods.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });

  const moodsOutput = findFile(compiled, "moods.js");
  const aliasMoods = join(output, "node_modules", "@", "lib", "audio-library", "moods.js");
  mkdirSync(join(output, "node_modules", "@", "lib", "audio-library"), { recursive: true });
  copyFileSync(moodsOutput, aliasMoods);

  const plan = require(findFile(compiled, "reference-segment-plan.js"));
  const presenter = plan.buildReferenceSegmentPlan({
    brief,
    segmentIndex: 1,
    segmentCount: 2,
    segmentSeconds: 10,
    outputTotalDurationSeconds: 20,
    sourceDurationSeconds: 20,
  });
  assert.equal(presenter.renderMode, "talking_head");
  assert.equal(presenter.motionMode, "continuous_motion");
  assert.equal(presenter.recommendedReferenceFrameCount, 2, "simple presenter footage uses the existing two-reference budget");
  assert.deepEqual(presenter.beats.map((beat) => [beat.startSeconds, beat.endSeconds]), [[0, 10]], "a complete source interval must not invent extra cuts");
  assert.equal(presenter.sourceStartSeconds, 0);
  assert.equal(presenter.sourceEndSeconds, 10);

  const broll = plan.buildReferenceSegmentPlan({
    brief: { ...brief, reference_subject_mode: "voiceover_broll", reference_format_mode: "voiceover_montage", reference_render_mode: "voiceover_broll" },
    segmentIndex: 1,
    segmentCount: 2,
    segmentSeconds: 10,
    sourceDurationSeconds: 20,
  });
  assert.equal(broll.renderMode, "voiceover_broll");
  assert.equal(broll.recommendedReferenceFrameCount, 4);

  const mixed = plan.buildReferenceSegmentPlan({
    brief: {
      ...brief,
      reference_format_mode: "voiceover_montage",
      reference_render_mode: "mixed",
      reference_motion_mode: "montage",
      camera_timeline: brief.camera_timeline.map((item, index) => ({ ...item, speech_mode: index ? "voiceover_only" : "on_camera" })),
    },
    segmentIndex: 1,
    segmentCount: 1,
    segmentSeconds: 10,
    sourceDurationSeconds: 20,
  });
  assert.equal(mixed.renderMode, "mixed");
  assert.equal(mixed.motionMode, "montage");
  assert.equal(mixed.recommendedReferenceFrameCount, 4);
  assert.deepEqual(mixed.beats.map((beat) => [beat.startSeconds, beat.endSeconds]), [[0, 5], [5, 10]]);

  const animation = plan.buildReferenceSegmentPlan({
    brief: { ...brief, reference_render_mode: "animation", reference_motion_mode: "animated_still" },
    segmentIndex: 1,
    segmentCount: 1,
    segmentSeconds: 10,
  });
  assert.equal(animation.renderMode, "animation");
  assert.equal(animation.motionMode, "animated_still");
  assert.match(plan.renderReferenceSegmentPlanForPrompt(animation), /REFERENCE SHOT CONTRACT/iu);
  assert.match(plan.renderReferenceSegmentPlanForPrompt(animation), /Beat 0-10s; source 0-10s/iu);
  console.log("Omni reference segment plan checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
