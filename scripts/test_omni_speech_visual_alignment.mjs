import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-speech-visual-alignment-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);

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
    files: [
      join(ui, "src/lib/server/omni/omni-speech-visual-alignment.ts"),
      join(ui, "src/lib/server/omni/storyboard/omni-storyboard-speech.ts"),
      join(ui, "src/lib/server/omni/reference-segment-plan.ts"),
      join(ui, "src/lib/audio-library/moods.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });

  const alignment = require(findFile(compiled, "omni-speech-visual-alignment.js"));
  const speech = require(findFile(compiled, "omni-storyboard-speech.js"));
  const reference = require(findFile(compiled, "reference-segment-plan.js"));
  const microBeatPlan = {
    version: "reference-segment-plan-v1",
    segmentIndex: 4,
    segmentCount: 4,
    outputStartSeconds: 24,
    outputEndSeconds: 28,
    durationSeconds: 4,
    sourceStartSeconds: 31.2,
    sourceEndSeconds: 36.4,
    sceneMode: "presenter",
    formatMode: "continuous_story",
    renderMode: "mixed",
    motionMode: "montage",
    recommendedReferenceFrameCount: 5,
    confidence: "high",
    beats: [
      beat(0, 0.62, 31.2, 32, "proof_broll", "voiceover_only", "no_people", "boat/city B-roll"),
      beat(0.62, 2, 32, 33.7, "presenter", "on_camera", "primary_presenter", "presenter returns"),
      beat(2, 4, 33.7, 36.4, "ending", "on_camera", "primary_presenter", "presenter closes"),
    ],
  };
  const microBeat = alignment.reconcileReferenceSegmentPlanToSpeech({
    plan: microBeatPlan,
    voiceoverText: "Ссылка в профиле. Нажми прямо сейчас и смотри",
    durationSeconds: 4,
  });
  assert.equal(microBeat.alignment.changed, true);
  assert.equal(microBeat.alignment.decisions.length, 1);
  assert.deepEqual(microBeat.alignment.decisions[0].speechFrameIndexes, [1]);
  assert.equal(microBeat.alignment.decisions[0].sourceStartSeconds, 31.2);
  assert.equal(microBeat.plan.beats.length, 2);
  assert.equal(microBeat.plan.beats[0].startSeconds, 0);
  assert.equal(microBeat.plan.beats[0].endSeconds, 2);
  assert.equal(microBeat.plan.beats[0].speechMode, "on_camera");
  assert.match(microBeat.plan.beats[0].adaptationRule, /merged an internal source cut/iu);
  assert.match(reference.renderReferenceSegmentPlanForPrompt(microBeat.plan), /PRE-RENDER SPEECH ALIGNMENT/iu);

  const frameAligned = alignment.reconcileReferenceSegmentPlanToSpeech({
    plan: {
      ...microBeatPlan,
      beats: [
        beat(0, 2, 31.2, 33.7, "proof_broll", "voiceover_only", "no_people", "full B-roll frame"),
        beat(2, 4, 33.7, 36.4, "ending", "on_camera", "primary_presenter", "presenter closes"),
      ],
    },
    voiceoverText: "Ссылка в профиле. Нажми прямо сейчас и смотри",
    durationSeconds: 4,
  });
  assert.equal(frameAligned.alignment, null);
  assert.equal(frameAligned.plan.beats.length, 2);

  const completePhrase = alignment.reconcileReferenceSegmentPlanToSpeech({
    plan: microBeatPlan,
    voiceoverText: "Ссылка в профиле сейчас. Нажми прямо сейчас сегодня",
    durationSeconds: 4,
  });
  assert.equal(completePhrase.alignment, null);
  assert.equal(completePhrase.plan.beats.length, 3);

  assert.deepEqual(
    speech.splitStoryboardSpeech("Ссылка в профиле. Нажми прямо сейчас и смотри", 2),
    ["Ссылка в профиле. Нажми", "прямо сейчас и смотри"],
  );
  assert.deepEqual(
    speech.splitStoryboardSpeech("Ссылка в профиле. Нажми прямо сейчас", 2),
    [],
    "speech splitter must reject a segment that cannot form exact four-word frames",
  );
  const chunks = speech.splitStoryboardSpeechWithBoundaries("Ссылка в профиле. Нажми прямо сейчас и смотри", 2);
  assert.equal(chunks[0].boundary, "continuation");
  assert.equal(chunks[1].boundary, "segment_end");

  console.log("Omni speech visual alignment checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function beat(startSeconds, endSeconds, sourceStartSeconds, sourceEndSeconds, sourceRole, speechMode, visibleSubjectRole, action) {
  return {
    startSeconds,
    endSeconds,
    sourceStartSeconds,
    sourceEndSeconds,
    action,
    gesture: "natural movement",
    camera: "medium shot",
    setting: "home",
    environment: "room",
    lighting: "soft light",
    speechMode,
    sourceRole,
    visibleSubjectRole,
    avatarAllowed: speechMode === "on_camera",
    visualDescription: action,
  };
}

function findFile(directory, filename) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      try { return findFile(path, filename); } catch { continue; }
    }
    if (entry.name === filename) return path;
  }
  throw new Error(`File ${filename} not found in ${directory}`);
}
