import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProviderPromptPlanFromDirector,
  lockDirectorPlanSpeech,
  normalizeDirectorSegmentPlan,
} from "./llm-prompt-chain-normalizer";
import { validateProviderPromptPlan } from "./provider-prompt-contract-validator";
import {
  validateStoryboardProviderAlignment,
  validateStoryboardProviderPlan,
} from "./llm-prompt-chain-storyboard-validator";

test("locks approved speech while preserving director visuals", () => {
  const director = normalizeDirectorSegmentPlan({
    format: "voiceover_broll",
    total_voiceover: "модель переписала текст",
    segments: [{
      index: 1,
      duration_seconds: 4,
      voiceover: "модель переписала текст",
      storyboard_frames: [
        frame(1, "environment_cutaway", "модель переписала"),
        frame(2, "product_cutaway", "текст сейчас"),
      ],
    }],
  });
  assert.ok(director);

  const lockedDirector = lockDirectorPlanSpeech(
    director,
    [{ text: "это утвержденный сценарий для двух точных кадров сегодня" }],
    [4],
    "voiceover_broll"
  );
  assert.equal(lockedDirector.totalVoiceover, "это утвержденный сценарий для двух точных кадров сегодня");
  assert.equal(lockedDirector.format, "voiceover_broll");
  assert.equal(lockedDirector.segments[0].voiceover, lockedDirector.totalVoiceover);
  assert.deepEqual(
    lockedDirector.segments[0].storyboardFrames.map((item) => item.role),
    ["environment_cutaway", "product_cutaway"]
  );
  assert.equal(
    lockedDirector.segments[0].storyboardFrames.map((item) => item.spokenWords).join(" "),
    lockedDirector.totalVoiceover
  );

  const provider = buildProviderPromptPlanFromDirector(lockedDirector);
  assert.equal(provider.segmentPrompts[0].voiceover, lockedDirector.totalVoiceover);
  assert.equal(provider.segmentPrompts[0].durationSeconds, 4);
  assert.match(provider.segmentPrompts[0].prompt, /за кадром/u);
  assert.equal(
    provider.segmentPrompts[0].storyboardFrames,
    lockedDirector.segments[0].storyboardFrames
  );
  assert.deepEqual(validateProviderPromptPlan(provider), []);
  assert.deepEqual(validateStoryboardProviderPlan(provider), []);
  assert.deepEqual(validateStoryboardProviderAlignment(lockedDirector, provider), []);
});

function frame(index: number, role: string, spokenWords: string) {
  return {
    index,
    role,
    spoken_words: spokenWords,
    visual_description: "конкретная наблюдаемая сцена",
    camera: "стабильный средний план",
    action: "объект движется в кадре",
    product_state: role === "product_cutaway" ? "продукт виден" : "продукт вне кадра",
    sfx: "звук комнаты",
    reference_role: role === "product_cutaway" ? "product" : "none",
  };
}
