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

  assert.equal(getOmniSegmentDurationForWordCount(5), null, "segments below the storyboard speech floor are invalid");
  assert.equal(getOmniSegmentDurationForWordCount(8), 4);
  assert.equal(getOmniSegmentDurationForWordCount(10), 4);
  assert.equal(getOmniSegmentDurationForWordCount(11), null);
  assert.equal(getOmniSegmentDurationForWordCount(12), 6);
  assert.equal(getOmniSegmentDurationForWordCount(16), 8);
  assert.equal(getOmniSegmentDurationForWordCount(20), 10);
  assert.equal(getOmniSegmentDurationForWordCount(21), 10);
  assert.equal(getOmniSegmentDurationForWordCount(23), 10);
  assert.equal(getOmniSegmentDurationForWordCount(25), null);
  assert.equal(getOmniSegmentDurationForWordCount(26), null);

  const exactThirty = normalizeOmniDurationRange({
    requestedMinSeconds: 30,
    requestedMaxSeconds: 30,
    fallbackSeconds: 30,
    source: "client_settings",
  });
  assert.equal(exactThirty.minSeconds, 30);
  assert.equal(exactThirty.maxSeconds, 30);
  assert.equal(exactThirty.minWords, 60);
  assert.equal(exactThirty.maxWords, 60);

  const configuredRange = normalizeOmniDurationRange({
    requestedMinSeconds: 30,
    requestedMaxSeconds: 40,
    fallbackSeconds: 35,
    source: "client_settings",
  });
  assert.equal(configuredRange.minSeconds, 30);
  assert.equal(configuredRange.maxSeconds, 40);
  assert.equal(configuredRange.maxWords, 80);

  const overLimit = normalizeOmniDurationRange({
    requestedMinSeconds: 50,
    requestedMaxSeconds: 50,
    fallbackSeconds: 50,
    source: "client_settings",
  });
  assert.equal(overLimit.minSeconds, 50);
  assert.equal(overLimit.maxSeconds, 50);
  assert.equal(overLimit.wasClamped, false);
  assert.equal(overLimit.minWords, 100);
  assert.equal(overLimit.maxWords, 100);

  const allowedDurations = new Set([4, 6, 8, 10]);
  for (const [wordCount, expectedSegments] of [
    [16, 2],
    [20, 2],
    [24, 2],
    [32, 2],
    [40, 2],
    [48, 3],
    [60, 3],
    [64, 4],
    [80, 4],
    [84, 5],
    [100, 5],
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
    [10, 10],
    "twenty-word segments must use the exact four-words-per-frame timing"
  );

  const cta = [
    "Этот предмет помогает навести порядок дома без лишних движений и сложных привычек.",
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
    "Наш апельсиновый коллаген в желеобразной форме усваивается эффективно, принося пользу организму.",
    "Артикул этого чудо средства вы найдете в описании под видео.",
  ].join(" ");
  const naturalBoundaryPlan = planOmniReelSegments(naturalBoundaryTrap);
  assert.ok(
    naturalBoundaryPlan.segmentWordCounts.every((count) => getOmniSegmentDurationForWordCount(count) !== null),
    "natural boundary traps must still produce valid storyboard word counts"
  );
  assert.equal(reconstructVoiceSegments(naturalBoundaryPlan.segments), naturalBoundaryTrap);

  const geodemikaIngredients = "Нашел решение для чистой кожи без раздражения и черных точек. Эта пенка для умывания Geodemika с протеазой и протеинами шелка эффективно борется с жирностью и черными точками. Она уменьшает высыпания, покраснения, снимает стянутость, не сушит кожу. Компоненты гинкго билоба и аллантоин способствуют обновлению клеток и увлажнению. Это средство для чувствительной, проблемной и обезвоженной кожи. Оцените результат. Артикул в описании ежедневно.";
  const geodemikaIngredientPlan = planOmniReelSegments(geodemikaIngredients, { durationRange: exactThirty });
  assert.equal(geodemikaIngredientPlan.segmentCount, 4);
  assert.ok(
    geodemikaIngredientPlan.segments.some((segment) => /протеинами шелка/iu.test(segment.text)),
    "stable ingredient phrases must stay inside one spoken segment"
  );
  assert.ok(
    !geodemikaIngredientPlan.segments.slice(0, -1).some((segment) => /[,;:]$/u.test(segment.text)),
    "spoken segments should not end on a comma when a sentence boundary plan is viable"
  );

  const geodemikaRoutine = "Не ждите чуда от ухода за кожей без одного важного правила. Даже люксовые средства не гарантируют одинаковый результат, ведь кожа у каждого своя. Очищайте кожу регулярно, поддерживая баланс каждый день. Энзимная пенка Geodemika бережно очищает, борется с черными точками и покраснениями, не стягивая кожу. Это полноценный уход для кожи, который работает. Попробуйте сами. Артикул в описании.";
  const exactTwentyEight = normalizeOmniDurationRange({
    requestedMinSeconds: 28,
    requestedMaxSeconds: 28,
    fallbackSeconds: 28,
    source: "client_settings",
  });
  const geodemikaRoutinePlan = planOmniReelSegments(geodemikaRoutine, { durationRange: exactTwentyEight });
  assert.equal(geodemikaRoutinePlan.segmentCount, 3);
  assert.ok(
    geodemikaRoutinePlan.segments.some((segment) => /бережно очищает, борется/iu.test(segment.text)),
    "verb-object phrase around the product benefit must not be split across Omni tasks"
  );
  assert.ok(
    !geodemikaRoutinePlan.segments.slice(0, -1).some((segment) => /[,;:]$/u.test(segment.text)),
    "routine script segments should end as complete spoken phrases"
  );

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
    () => planOmniReelSegments(makeScript(126)),
    (error) => error instanceof Error && /Максимум 100 слов/u.test(error.message),
    "scripts above the five-part limit must be rejected instead of creating a sixth segment"
  );

  assert.throws(
    () => planOmniReelSegments(makeScript(11)),
    (error) => error instanceof Error && /слишком короткий/u.test(error.message),
    "plans below two useful segments should be rejected"
  );

  const exactThirtyPlan = planOmniReelSegments(makeScript(60), { durationRange: exactThirty });
  assert.equal(exactThirtyPlan.durationSeconds, 30);
  assert.equal(exactThirtyPlan.segmentDurationsSeconds.reduce((sum, duration) => sum + duration, 0), 30);

  const expandedPlan = planOmniReelSegments(makeScript(72), { durationRange: configuredRange });
  assert.deepEqual(expandedPlan.segmentWordCounts, [20, 20, 20, 12]);
  assert.deepEqual(expandedPlan.segmentDurationsSeconds, [10, 10, 10, 6]);
  assert.equal(expandedPlan.durationSeconds, 36);
  const tailPlan = planOmniReelSegments(makeScript(74), { durationRange: configuredRange });
  assert.deepEqual(tailPlan.segmentWordCounts, [20, 20, 20, 14]);
  assert.deepEqual(tailPlan.segmentDurationsSeconds, [10, 10, 10, 6]);
  assert.equal(tailPlan.durationSeconds, 36);
  const threeWordTailPlan = planOmniReelSegments(makeScript(71), { durationRange: configuredRange });
  assert.deepEqual(threeWordTailPlan.segmentWordCounts, [20, 20, 16, 15]);
  assert.deepEqual(threeWordTailPlan.segmentDurationsSeconds, [10, 10, 8, 6]);
  assert.equal(threeWordTailPlan.durationSeconds, 34);
  for (const wordCount of [66, 71, 72, 74]) {
    const productionPlan = planOmniReelSegments(makeScript(wordCount), { durationRange: configuredRange });
    assert.ok(
      productionPlan.durationSeconds >= configuredRange.minSeconds &&
        productionPlan.durationSeconds <= configuredRange.maxSeconds,
      `${wordCount} words must fit the configured 30-40 second range`
    );
  }
  const naturalExpansion = planOmniReelSegments(makeScript(80), { durationRange: configuredRange });
  assert.equal(naturalExpansion.durationSeconds, 40, "a longer configured range can carry a naturally longer script");
  assert.throws(
    () => planOmniReelSegments(makeScript(80), { durationRange: exactThirty }),
    (error) => error instanceof Error && /нельзя упаковать.*30-30 секунд/u.test(error.message),
    "a script that needs 40 seconds must not silently exceed an exact 30-second setting"
  );
  assert.throws(
    () => planOmniReelSegments(makeScript(75), { durationRange: exactThirty }),
    (error) => error instanceof Error && /нельзя упаковать.*30-30 секунд/u.test(error.message),
    "a three-word tail can be redistributed, but the resulting plan still must respect an exact 30-second setting"
  );

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
