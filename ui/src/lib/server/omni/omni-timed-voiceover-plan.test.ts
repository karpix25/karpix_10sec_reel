import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOmniTimedVoiceoverPlan,
  readOmniTimedVoiceoverPlan,
  reconstructTimedVoiceoverPlan,
} from "./omni-timed-voiceover-plan";
import { normalizeOmniDurationRange } from "./omni-duration-range";

test("timed voiceover plan keeps complete sentence boundaries and frame budgets", () => {
  const script = "Проблема знакома каждому сегодня. Решение уже рядом теперь. Наш продукт помогает каждый день. Попробуйте его прямо сейчас сегодня.";
  const plan = buildOmniTimedVoiceoverPlan(script);

  assert.equal(plan.segmentCount, 2);
  assert.equal(plan.durationSeconds, 10);
  assert.equal(reconstructTimedVoiceoverPlan(plan), script);
  assert.deepEqual(plan.segments.map((segment) => segment.durationSeconds), [4, 6]);
  assert.deepEqual(plan.segments.map((segment) => segment.wordCount), [8, 10]);
  assert.deepEqual(plan.segments.map((segment) => segment.startSeconds), [0, 4]);
  assert.deepEqual(plan.segments.map((segment) => segment.frameWordCounts), [[4, 4], [4, 3, 3]]);
  assert.match(plan.segments[0].text, /[.!?…]$/u);
  const restored = readOmniTimedVoiceoverPlan({ timed_voiceover_plan: plan });
  assert.ok(restored);
  assert.deepEqual(restored.segments.map((segment) => segment.frameWordCounts), [[4, 4], [4, 3, 3]]);
});

test("invalid persisted timing metadata is not silently accepted", () => {
  const plan = buildOmniTimedVoiceoverPlan(
    "Проблема знакома каждому сегодня. Решение уже рядом теперь. Наш продукт помогает каждый день. Попробуйте его прямо сейчас сегодня."
  );
  const invalid = structuredClone(plan);
  invalid.segments[1].durationSeconds = 4;

  assert.throws(
    () => readOmniTimedVoiceoverPlan({ timed_voiceover_plan: invalid }),
    /Invalid timed plan segment|timing metadata is invalid|duration is invalid/u
  );
});

test("planner preserves sentence boundaries even when a sentence is not a multiple of four words", () => {
  const plan = buildOmniTimedVoiceoverPlan(
    "Это предложение содержит ровно девять слов прямо сейчас сегодня. И это другое предложение также имеет ровно девять слов."
  );

  assert.deepEqual(plan.segments.map((segment) => segment.wordCount), [9, 9]);
  assert.deepEqual(plan.segments.map((segment) => segment.durationSeconds), [6, 6]);
  assert.deepEqual(plan.segments.map((segment) => segment.frameWordCounts), [[3, 3, 3], [3, 3, 3]]);
  assert.equal(reconstructTimedVoiceoverPlan(plan), plan.script);
});

test("duration range is enforced after natural sentence packing", () => {
  const exactThirty = normalizeOmniDurationRange({
    requestedMinSeconds: 30,
    requestedMaxSeconds: 30,
    fallbackSeconds: 30,
    source: "client_settings",
  });
  const thirtyToForty = normalizeOmniDurationRange({
    requestedMinSeconds: 30,
    requestedMaxSeconds: 40,
    fallbackSeconds: 35,
    source: "client_settings",
  });
  const script = Array.from({ length: 4 }, (_, sentenceIndex) =>
    Array.from({ length: 20 }, (_, wordIndex) => `фраза${sentenceIndex + 1}_${wordIndex + 1}`).join(" ") + "."
  ).join(" ");

  const expandedPlan = buildOmniTimedVoiceoverPlan(script, { durationRange: thirtyToForty });
  assert.equal(expandedPlan.durationSeconds, 40);
  assert.deepEqual(expandedPlan.segments.map((segment) => segment.wordCount), [20, 20, 20, 20]);
  const naturalPlan = buildOmniTimedVoiceoverPlan(script, { durationRange: exactThirty });
  assert.equal(naturalPlan.durationSeconds, 40);
});

test("realistic #796 script packs into complete sentences without a fake word limit", () => {
  const script = "Мы переехали в Испанию и узнали, что тут во время сиесты с двух до пяти ничего не работает. Особенно когда срочно нужно купить лекарства в аптеке, а все уже отдыхают. Для любых зарубежных покупок я оформил Плати по миру виртуальная карта прямо в телеграм. Ссылка в шапке профиля помогает мне оплачивать сервисы без ограничений в любой точке мира. Теперь мои зарубежные платежи проходят быстро и без лишних сложностей.";
  const plan = buildOmniTimedVoiceoverPlan(script, {
    durationRange: normalizeOmniDurationRange({
      requestedMinSeconds: 30,
      requestedMaxSeconds: 40,
      fallbackSeconds: 35,
      source: "client_settings",
    }),
  });

  assert.deepEqual(plan.segments.map((segment) => segment.wordCount), [18, 12, 14, 14, 10]);
  assert.deepEqual(plan.segments.map((segment) => segment.durationSeconds), [10, 6, 8, 8, 6]);
  assert.equal(plan.durationSeconds, 38);
  assert.equal(reconstructTimedVoiceoverPlan(plan), script);
});
