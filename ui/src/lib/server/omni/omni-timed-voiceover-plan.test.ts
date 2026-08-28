import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOmniTimedVoiceoverPlan,
  readOmniTimedVoiceoverPlan,
  reconstructTimedVoiceoverPlan,
} from "./omni-timed-voiceover-plan";

test("timed voiceover plan keeps complete sentence boundaries and frame budgets", () => {
  const script = "Проблема знакома каждому сегодня. Решение уже рядом теперь. Наш продукт помогает каждый день. Попробуйте его прямо сейчас сегодня.";
  const plan = buildOmniTimedVoiceoverPlan(script);

  assert.equal(plan.segmentCount, 2);
  assert.equal(plan.durationSeconds, 8);
  assert.equal(reconstructTimedVoiceoverPlan(plan), script);
  assert.deepEqual(plan.segments.map((segment) => segment.durationSeconds), [4, 4]);
  assert.deepEqual(plan.segments.map((segment) => segment.startSeconds), [0, 4]);
  assert.deepEqual(plan.segments.map((segment) => segment.frameWordCounts), [[4, 4], [5, 5]]);
  assert.match(plan.segments[0].text, /[.!?…]$/u);
});

test("invalid persisted timing metadata is not silently accepted", () => {
  const plan = buildOmniTimedVoiceoverPlan(
    "Проблема знакома каждому сегодня. Решение уже рядом теперь. Наш продукт помогает каждый день. Попробуйте его прямо сейчас сегодня."
  );
  const invalid = structuredClone(plan);
  invalid.segments[1].durationSeconds = 6;

  assert.throws(
    () => readOmniTimedVoiceoverPlan({ timed_voiceover_plan: invalid }),
    /Invalid timed plan segment|timing metadata is invalid|duration is invalid/u
  );
});

test("planner rejects a script that only fits by cutting through a sentence", () => {
  assert.throws(
    () => buildOmniTimedVoiceoverPlan(
      "Это предложение содержит ровно девять слов прямо сейчас сегодня. И это другое предложение также имеет ровно девять слов."
    ),
    /завершенным предложением|разделить сценарий/u
  );
});
