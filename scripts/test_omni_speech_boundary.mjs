import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-speech-boundary-"));
const require = createRequire(import.meta.url);

try {
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/omni-speech-boundary.ts",
      "src/lib/server/omni/omni-script-segmentation.ts",
      "src/lib/server/omni/script-beat-plan.ts",
      "src/lib/server/omni/omni-script-text-contract.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const {
    repairScriptBeatBoundaryRepeats,
    repairVoiceSegmentBoundaryRepeats,
  } = require(join(output, "omni-speech-boundary.js"));
  const { reconstructVoiceSegments } = require(join(output, "omni-script-segmentation.js"));

  const ru = repairVoiceSegmentBoundaryRepeats([
    { index: 1, text: "Коллаген проще принимать каждый день.", wordCount: 5 },
    { index: 2, text: "Каждый день это занимает минуту.", wordCount: 5 },
  ]);
  assert.equal(ru.repair.changed, true);
  assert.deepEqual(ru.repair.removedPhrases, ["Каждый день"]);
  assert.equal(ru.segments[1].text, "это занимает минуту.");
  assert.equal(reconstructVoiceSegments(ru.segments), "Коллаген проще принимать каждый день. это занимает минуту.");

  const en = repairVoiceSegmentBoundaryRepeats([
    { index: 1, text: "I mix it every morning.", wordCount: 5 },
    { index: 2, text: "Every morning it takes one minute.", wordCount: 6 },
  ]);
  assert.equal(en.repair.changed, true);
  assert.equal(en.segments[1].text, "it takes one minute.");

  const stopword = repairVoiceSegmentBoundaryRepeats([
    { index: 1, text: "Я беру стик и", wordCount: 4 },
    { index: 2, text: "и размешиваю его утром", wordCount: 4 },
  ]);
  assert.equal(stopword.repair.changed, false, "single-word overlaps must not be auto-repaired");
  assert.equal(stopword.segments[1].text, "и размешиваю его утром");

  const yo = repairVoiceSegmentBoundaryRepeats([
    { index: 1, text: "Это даёт ощущение лёгкости.", wordCount: 4 },
    { index: 2, text: "дает ощущение легкости уже утром.", wordCount: 5 },
  ]);
  assert.equal(yo.repair.changed, true, "ё/е and punctuation should not block exact token repair");
  assert.equal(yo.segments[1].text, "уже утром.");

  const planRepair = repairScriptBeatBoundaryRepeats({
    hookOptions: [],
    selectedHook: "hook",
    beats: [
      { stage: "hook", visualCue: "говорит", voiceover: "Коллаген проще принимать каждый день." },
      { stage: "body", visualCue: "показывает стик", voiceover: "каждый день это занимает минуту." },
    ],
  });
  assert.equal(planRepair.repair.changed, true);
  assert.equal(planRepair.plan.beats[1].voiceover, "это занимает минуту.");
  assert.equal(planRepair.scriptText, "Коллаген проще принимать каждый день. это занимает минуту.");

  console.log("Omni speech boundary regression checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
