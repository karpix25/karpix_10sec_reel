import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
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

  const { planOmniReelSegments } = require(findFile(output, "omni-duration-planner.js"));
  const { getOmniSegmentDurationForWordCount } = require(findFile(output, "omni-speech-density.js"));
  const { normalizeOmniDurationRange } = require(findFile(output, "omni-duration-range.js"));
  const { reconstructVoiceSegments, splitScriptIntoVoiceSegments } = require(findFile(output, "omni-script-segmentation.js"));

  assert.equal(getOmniSegmentDurationForWordCount(7), null, "segments below the storyboard speech floor are invalid");
  assert.equal(getOmniSegmentDurationForWordCount(8), 4);
  assert.equal(getOmniSegmentDurationForWordCount(10), 4);
  assert.equal(getOmniSegmentDurationForWordCount(11), null, "eleven words cannot split into frames of four or five words");
  assert.equal(getOmniSegmentDurationForWordCount(12), 6);
  assert.equal(getOmniSegmentDurationForWordCount(16), 8);
  assert.equal(getOmniSegmentDurationForWordCount(20), 8);
  assert.equal(getOmniSegmentDurationForWordCount(21), 10);
  assert.equal(getOmniSegmentDurationForWordCount(25), 10);
  assert.equal(getOmniSegmentDurationForWordCount(26), null);

  const exactThirty = normalizeOmniDurationRange({
    requestedMinSeconds: 30,
    requestedMaxSeconds: 30,
    fallbackSeconds: 30,
    source: "client_settings",
  });
  assert.equal(exactThirty.minSeconds, 30);
  assert.equal(exactThirty.maxSeconds, 30);
  assert.equal(exactThirty.minWords, 62);
  assert.equal(exactThirty.maxWords, 75);

  const overLimit = normalizeOmniDurationRange({
    requestedMinSeconds: 50,
    requestedMaxSeconds: 50,
    fallbackSeconds: 50,
    source: "client_settings",
  });
  assert.equal(overLimit.minSeconds, 40);
  assert.equal(overLimit.maxSeconds, 40);
  assert.equal(overLimit.wasClamped, true);
  assert.equal(overLimit.minWords, 82);
  assert.equal(overLimit.maxWords, 100);

  const allowedDurations = new Set([4, 6, 8, 10]);
  for (const [wordCount, expectedSegments] of [
    [16, 2],
    [20, 2],
    [22, 2],
    [24, 2],
    [31, 2],
    [40, 2],
    [50, 2],
    [51, 3],
    [60, 3],
    [75, 3],
    [76, 4],
    [100, 4],
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
    assert.ok(
      plan.segmentWordCounts.every((count) => getOmniSegmentDurationForWordCount(count) !== null),
      "every segment must map to a storyboard duration"
    );
    assert.equal(reconstructVoiceSegments(plan.segments), script, "the source script must reconstruct exactly");
  }

  const denseBoundaryPlan = planOmniReelSegments(makeScript(40));
  assert.deepEqual(
    denseBoundaryPlan.segmentDurationsSeconds,
    [8, 8],
    "twenty-word segments must use the shorter dense timing instead of being stretched to ten seconds"
  );

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

  const naturalBoundaryTrap = [
    "Можно ли выглядеть моложе без уколов красоты?",
    "Да, если пить коллаген.",
    "Он улучшает состояние кожи, делая её упругой и сияющей.",
    "Волосы становятся крепче, а ногти перестают слоиться.",
    "Наш апельсиновый коллаген в желеобразной форме усваивается максимально эффективно, принося пользу всему организму.",
    "Артикул этого чудо средства вы найдете в описании под видео.",
  ].join(" ");
  const naturalBoundaryPlan = planOmniReelSegments(naturalBoundaryTrap);
  assert.ok(
    naturalBoundaryPlan.segmentWordCounts.every((count) => getOmniSegmentDurationForWordCount(count) !== null),
    "natural boundary traps must still produce valid storyboard word counts"
  );
  assert.equal(reconstructVoiceSegments(naturalBoundaryPlan.segments), naturalBoundaryTrap);

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
    () => planOmniReelSegments(makeScript(101)),
    (error) => error instanceof Error && /101 слов.*Максимум 100 слов/u.test(error.message)
  );

  assert.throws(
    () => planOmniReelSegments(makeScript(15)),
    (error) => error instanceof Error && /слишком короткий/u.test(error.message),
    "plans below two useful segments should be rejected"
  );

  const exactThirtyPlan = planOmniReelSegments(makeScript(69), { durationRange: exactThirty });
  assert.equal(exactThirtyPlan.durationSeconds, 30);
  assert.equal(exactThirtyPlan.segmentDurationsSeconds.reduce((sum, duration) => sum + duration, 0), 30);

  console.log("Omni segment planner regression checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function makeScript(wordCount) {
  return Array.from(
    { length: wordCount },
    (_, index) => `слово${index + 1}`
  ).join(" ");
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
