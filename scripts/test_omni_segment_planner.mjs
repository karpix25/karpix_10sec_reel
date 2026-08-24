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
  assert.equal(getOmniSegmentDurationForWordCount(7), 4);
  assert.equal(getOmniSegmentDurationForWordCount(8), 4);
  assert.equal(getOmniSegmentDurationForWordCount(10), 4);
  assert.equal(getOmniSegmentDurationForWordCount(11), 6);
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
  assert.equal(overLimit.minSeconds, 50);
  assert.equal(overLimit.maxSeconds, 50);
  assert.equal(overLimit.wasClamped, false);
  assert.equal(overLimit.minWords, 103);
  assert.equal(overLimit.maxWords, 125);

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
    [101, 5],
    [125, 5],
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

  const geodemikaIngredients = "Я нашел решение для чистой кожи без раздражения и черных точек. Эта энзимная пенка для умывания Geodemika с протеазой и протеинами шелка эффективно борется с жирностью и черными точками. Она уменьшает высыпания, покраснения, снимает ощущение стянутости, не сушит кожу. Специальные компоненты гинкго билоба и аллантоин способствуют обновлению клеток и глубокому увлажнению. Это идеальное средство для чувствительной, проблемной и обезвоженной кожи. Оцените результат сами. Артикул в описании.";
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

  const geodemikaRoutine = "Не ждите чуда от ухода за кожей без понимания одного важного правила. Даже если вы используете люксовые средства, результат не всегда идентичен, ведь кожа у каждого своя. Важно очищать кожу регулярно, поддерживая её баланс каждый день. Энзимная пенка Geodemika бережно очищает, борется с черными точками и покраснениями, не стягивая кожу. Это не просто очищение, а полноценный уход, который работает. Попробуйте сами. Артикул в описании.";
  const exactTwentyEight = normalizeOmniDurationRange({
    requestedMinSeconds: 28,
    requestedMaxSeconds: 28,
    fallbackSeconds: 28,
    source: "client_settings",
  });
  const geodemikaRoutinePlan = planOmniReelSegments(geodemikaRoutine, { durationRange: exactTwentyEight });
  assert.equal(geodemikaRoutinePlan.segmentCount, 4);
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
    (error) => error instanceof Error && /Максимум 125 слов/u.test(error.message),
    "scripts above the five-part limit must be rejected instead of creating a sixth segment"
  );

  assert.throws(
    () => planOmniReelSegments(makeScript(11)),
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
