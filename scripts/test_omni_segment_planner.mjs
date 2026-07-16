import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-segment-planner-"));
const require = createRequire(import.meta.url);

try {
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/omni-duration-planner.ts",
      "src/lib/server/omni/omni-script-segmentation.ts",
      "src/lib/server/omni/omni-duration-range.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const { planOmniReelSegments } = require(join(output, "omni-duration-planner.js"));
  const { getOmniSegmentDurationForWordCount } = require(join(output, "omni-speech-density.js"));
  const { normalizeOmniDurationRange } = require(join(output, "omni-duration-range.js"));
  const { reconstructVoiceSegments, splitScriptIntoVoiceSegments } = require(join(output, "omni-script-segmentation.js"));

  assert.equal(getOmniSegmentDurationForWordCount(7), null, "segments below the useful speech floor are invalid");
  assert.equal(getOmniSegmentDurationForWordCount(8), 4);
  assert.equal(getOmniSegmentDurationForWordCount(14), 6);
  assert.equal(getOmniSegmentDurationForWordCount(19), 8);
  assert.equal(getOmniSegmentDurationForWordCount(24), 10);

  const exactThirty = normalizeOmniDurationRange({
    requestedMinSeconds: 30,
    requestedMaxSeconds: 30,
    fallbackSeconds: 30,
    source: "client_settings",
  });
  assert.equal(exactThirty.minSeconds, 30);
  assert.equal(exactThirty.maxSeconds, 30);
  assert.equal(exactThirty.minWords, 60);
  assert.equal(exactThirty.maxWords, 72);

  const overLimit = normalizeOmniDurationRange({
    requestedMinSeconds: 50,
    requestedMaxSeconds: 50,
    fallbackSeconds: 50,
    source: "client_settings",
  });
  assert.equal(overLimit.minSeconds, 40);
  assert.equal(overLimit.maxSeconds, 40);
  assert.equal(overLimit.wasClamped, true);
  assert.equal(overLimit.minWords, 80);
  assert.equal(overLimit.maxWords, 96);

  const allowedDurations = new Set([4, 6, 8, 10]);
  for (const [wordCount, expectedSegments] of [
    [16, 2],
    [19, 2],
    [24, 2],
    [25, 2],
    [29, 2],
    [35, 2],
    [36, 2],
    [48, 2],
    [49, 3],
    [54, 3],
    [72, 3],
    [73, 4],
    [90, 4],
  ]) {
    const script = makeScript(wordCount);
    const plan = planOmniReelSegments(script);
    assert.equal(plan.segmentCount, expectedSegments, `${wordCount} words should use ${expectedSegments} segments`);
    assert.equal(plan.segmentDurationsSeconds.length, expectedSegments);
    assert.ok(
      plan.segmentDurationsSeconds.every((duration) => allowedDurations.has(duration)),
      "every segment duration must be one of the provider-supported values"
    );
    assert.equal(
      plan.durationSeconds,
      plan.segmentDurationsSeconds.reduce((sum, duration) => sum + duration, 0)
    );
    assert.ok(plan.segmentWordCounts.every((count) => count <= 24), "every segment must fit 24 useful words");
    assert.equal(reconstructVoiceSegments(plan.segments), script, "the source script must reconstruct exactly");
  }

  const cta = [
    "Этот предмет помогает быстро навести порядок дома без лишних движений и сложных привычек.",
    "Напишите кодовое слово ХОЧУ в комментариях.",
    "Я отправлю подробности и покажу простой способ применения сегодня.",
    "Это экономит время каждый день и делает привычку простой.",
  ].join(" ");
  const ctaPlan = planOmniReelSegments(cta);
  assert.ok(
    ctaPlan.segments.some((segment) => segment.text.includes("Напишите кодовое слово ХОЧУ в комментариях.")),
    "the protected CTA must remain inside one segment"
  );
  assert.equal(reconstructVoiceSegments(ctaPlan.segments), cta);

  // Test fallback when a protected CTA cannot fit the strict segment word constraints
  // Total words = 7 + 8 + 9 = 24 words. count = 3. maxWordsPerSegment = 8.
  // The only valid split of 24 words into 3 segments with max 8 words per segment is [8, 8, 8].
  // But the CTA matches "Напишите раз два три четыре пять в комментариях" (8 words) starting at index 7,
  // which protects boundary 8. So the solver fails, and our fallback kicks in.
  const longCtaText = Array(7).fill("Слово").join(" ") + " Напишите раз два три четыре пять в комментариях " + Array(9).fill("Слово").join(" ");
  const fallbackSegments = splitScriptIntoVoiceSegments(longCtaText, 3, 8);
  assert.equal(fallbackSegments.length, 3);
  assert.equal(reconstructVoiceSegments(fallbackSegments), reconstructVoiceSegments(splitScriptIntoVoiceSegments(longCtaText, 1)));
  assert.ok(fallbackSegments.every(seg => seg.wordCount > 0), "no segment should be empty");

  assert.throws(
    () => planOmniReelSegments(makeScript(97)),
    (error) => error instanceof Error && /97 слов.*Максимум 96 слов/u.test(error.message)
  );

  assert.throws(
    () => planOmniReelSegments(makeScript(15)),
    (error) => error instanceof Error && /слишком короткий/u.test(error.message),
    "plans below two useful segments should be rejected"
  );

  const exactThirtyPlan = planOmniReelSegments(makeScript(60), { durationRange: exactThirty });
  assert.equal(exactThirtyPlan.durationSeconds, 30);
  assert.equal(exactThirtyPlan.segmentDurationsSeconds.reduce((sum, duration) => sum + duration, 0), 30);

  console.log("Omni segment planner regression checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function makeScript(wordCount) {
  return Array.from(
    { length: wordCount },
    (_, index) => `слово${index + 1}${(index + 1) % 20 === 0 ? "." : ""}`
  ).join(" ");
}
