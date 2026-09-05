import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const ui = resolve(import.meta.dirname, "../ui");
const output = mkdtempSync(join(tmpdir(), "omni-speech-preflight-"));
const require = createRequire(import.meta.url);

try {
  const compiled = join(output, "compiled");
  const tsconfig = join(output, "tsconfig.json");
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      rootDir: join(ui, "src"), outDir: compiled,
      module: "commonjs", target: "es2022", moduleResolution: "node",
      baseUrl: ui, paths: { "@/*": ["src/*"] },
      typeRoots: [join(ui, "node_modules/@types")], types: ["node"],
      skipLibCheck: true, esModuleInterop: true,
    },
    files: [
      "lib/server/omni/omni-duration-planner.ts",
      "lib/server/omni/storyboard/omni-storyboard-speech.ts",
      "lib/server/omni/omni-timed-voiceover-plan.test.ts",
      "lib/server/omni/llm-prompt-chain-prompts.ts",
    ].map((path) => join(ui, "src", path)),
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });
  const { analyzeOmniSpeechLoad } = require(join(compiled, "lib/omni/storyboard/omni-speech-load.js"));
  const { planOmniReelSegments } = require(join(compiled, "lib/server/omni/omni-duration-planner.js"));
  const { splitStoryboardSpeechWithBoundaries } = require(join(compiled, "lib/server/omni/storyboard/omni-storyboard-speech.js"));
  const { resolveOmniTimedVoiceoverPlan, buildOmniTimedVoiceoverPlan } = require(join(compiled, "lib/server/omni/omni-timed-voiceover-plan.js"));
  const { normalizeOmniDurationRange } = require(join(compiled, "lib/server/omni/omni-duration-range.js"));
  const { buildCreativeCopywriterPrompt, buildDirectorSegmenterPrompt } = require(join(compiled, "lib/server/omni/llm-prompt-chain-prompts.js"));

  const short = analyzeOmniSpeechLoad("Вот наш товар здесь", 4);
  const long = analyzeOmniSpeechLoad("Рассматриваем особенности представленной упаковки", 4);
  assert.equal(short.wordCount, long.wordCount);
  assert.equal(short.approximateRussianSyllables, 5);
  assert.equal(long.approximateRussianSyllables, 18);
  assert.equal(short.targetWords, 8);
  assert.equal(short.missingTargetWords, 4);
  assert.equal("estimatedSeconds" in long, false, "uncalibrated vowel counts must not pretend to measure duration");

  const uncertain = analyzeOmniSpeechLoad("Это… API 123. Карта? Visa!", 4);
  assert.equal(uncertain.ellipsisCount, 1);
  assert.equal(uncertain.pauseMarkCount, 4);
  assert.deepEqual(uncertain.pronunciationUncertainWords, ["API", "123.", "Visa!"]);

  const seventeenWords = Array(17).fill("слово").join(" ") + ".";
  const sparse = analyzeOmniSpeechLoad(seventeenWords, 10);
  assert.equal(sparse.missingTargetWords, 3);
  assert.deepEqual(sparse.frames.map((frame) => frame.wordCount), [4, 4, 3, 3, 3]);
  assert.deepEqual(sparse.frames.map((frame) => frame.missingTargetWords), [0, 0, 1, 1, 1]);
  const chunks = splitStoryboardSpeechWithBoundaries(seventeenWords, 5);
  assert.equal(chunks.map((chunk) => chunk.text).join(" "), seventeenWords, "alignment must preserve every approved word without fillers");
  assert.deepEqual(chunks.map((chunk) => chunk.boundary), ["continuation", "continuation", "continuation", "continuation", "sentence"]);

  const balancedScript = [8, 7, 7].map((count) => Array(count).fill("слово").join(" ") + ".").join(" ");
  const balanced = planOmniReelSegments(balancedScript, { requireSentenceBoundaries: true });
  assert.deepEqual(balanced.segmentWordCounts, [15, 7], "equal-duration choices should avoid concentrating unused speech capacity in one segment");
  const sentences = [8, 7, 7].map((count) => Array(count).fill("слово").join(" ") + ".");
  const repaired = buildOmniTimedVoiceoverPlan(balancedScript, { speechSegments: [
    { durationSeconds: 4, voiceover: sentences[0].replace(/\.$/u, ",") },
    { durationSeconds: 8, voiceover: sentences.slice(1).join(" ") },
  ] });
  assert.deepEqual(repaired.segments.map((segment) => segment.wordCount), [15, 7], "raw model groups must never choose final speech boundaries");
  assert.deepEqual(repaired.segments.map((segment) => segment.durationSeconds), [8, 4]);
  assert.deepEqual(resolveOmniTimedVoiceoverPlan({ script: balancedScript, sourceSnapshot: { timed_voiceover_plan: repaired } }).segments, repaired.segments);
  const chainInput = {
    projectName: "Speech test", productName: "Карта для зарубежных покупок",
    sourceScenario: { script: balancedScript }, avatarSpeechGender: "male",
    ctaMode: "no_explicit_cta",
  };
  const writerPrompt = buildCreativeCopywriterPrompt(chainInput);
  assert.match(writerPrompt, /Длинное название продукта произносится медленнее коротких слов/u);
  assert.match(writerPrompt, /не заполняй время повторами, междометиями/u);
  const directorPrompt = buildDirectorSegmenterPrompt({ chainInput, draft: { script: balancedScript }, segmentPlan: balanced });
  assert.match(directorPrompt, /склейка и переход на B-roll не требуют паузы/u);
  assert.match(directorPrompt, /"approximateRussianSyllables"/u);
  assert.match(directorPrompt, /не команда ускорять речь или менять утвержденные слова/u);

  for (const seconds of [20, 30, 40]) {
    const script = Array.from({ length: seconds / 10 }, () => Array(20).fill("слово").join(" ") + ".").join(" ");
    const durationRange = normalizeOmniDurationRange({ requestedMinSeconds: seconds, requestedMaxSeconds: seconds, source: "client_settings" });
    const planned = planOmniReelSegments(script, { durationRange, requireSentenceBoundaries: true });
    assert.equal(planned.durationSeconds, seconds);
    assert.ok(planned.speechDiagnostics.every((diagnostic) => diagnostic.missingTargetWords === 0));
    assert.doesNotMatch(planned.reason, /без пауз/u, "word counts alone cannot promise pause-free speech");
    const stored = buildOmniTimedVoiceoverPlan(script, { durationRange });
    const restored = resolveOmniTimedVoiceoverPlan({ script, sourceSnapshot: { timed_voiceover_plan: stored } });
    assert.equal(restored.durationSeconds, seconds);
    assert.deepEqual(restored.segments, stored.segments, "persisted timing must not be replanned");
  }

  execFileSync(process.execPath, ["--test", join(compiled, "lib/server/omni/omni-timed-voiceover-plan.test.js")], { stdio: "inherit" });
  const legacySegmentationCheck = join(output, "segmentation.mjs");
  writeFileSync(legacySegmentationCheck, readFileSync(join(ui, "../scripts/test_omni_script_segmentation.mjs"), "utf8")
    .replace("../ui/src/lib/server/omni/omni-script-segmentation.ts", pathToFileURL(join(compiled, "lib/server/omni/omni-script-segmentation.js")).href));
  execFileSync(process.execPath, [legacySegmentationCheck], { stdio: "inherit" });
  console.log("Omni speech preflight checks passed (local, no provider calls)");
} finally {
  rmSync(output, { recursive: true, force: true });
}
