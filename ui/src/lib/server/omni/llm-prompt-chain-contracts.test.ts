import assert from "node:assert/strict";
import { test } from "node:test";

import type { DirectorSegmentPlan } from "./llm-prompt-chain-types";
import { validateStoryboardDirectorPlan } from "./llm-prompt-chain-storyboard-validator";
import { validateDirectorSegmentPlan } from "./provider-prompt-contract-validator";
import { resolveReferenceSceneMode } from "./omni-reference-scene-mode";

test("director storyboard contracts stay format neutral and speech exact", () => {
  const plan = makePlan();
  const directorIssues = validateDirectorSegmentPlan(plan);

  assert.equal(directorIssues.filter((issue) => issue.severity === "error").length, 0);
  assert.deepEqual(validateStoryboardDirectorPlan(plan), []);

  const duplicateTotal = {
    ...plan,
    totalVoiceover: `${plan.totalVoiceover} каждый день`,
  };
  assert.ok(
    validateStoryboardDirectorPlan(duplicateTotal).some(
      (issue) => issue.code === "director_total_voiceover_mismatch"
    )
  );

  const shortenedTotal = {
    ...plan,
    totalVoiceover: plan.totalVoiceover.replace(" каждый день", ""),
  };
  assert.ok(
    validateStoryboardDirectorPlan(shortenedTotal).some(
      (issue) => issue.code === "director_total_voiceover_mismatch"
    )
  );

  const badFrameSpeech = structuredClone(plan);
  badFrameSpeech.segments[1].storyboardFrames[1].spokenWords = "каждый день каждый";
  assert.ok(
    validateStoryboardDirectorPlan(badFrameSpeech).some(
      (issue) => issue.code === "storyboard_voiceover_mismatch"
    )
  );

  const badRole = structuredClone(plan);
  badRole.segments[0].storyboardFrames[0].role = "unknown" as never;
  assert.ok(
    validateStoryboardDirectorPlan(badRole).some((issue) => issue.code === "storyboard_invalid_role")
  );
});

test("video analysis visible subject policy controls non presenter formats", () => {
  assert.equal(resolveReferenceSceneMode({ visible_subject_policy: "no_people" }), "voiceover_broll");
  assert.equal(resolveReferenceSceneMode({ visible_subject_policy: "animation" }), "animation");
  assert.equal(resolveReferenceSceneMode({ visible_subject_policy: "hands_only" }), "faceless_hands");
  assert.equal(resolveReferenceSceneMode({ visible_subject_policy: "object_only" }), "object_only");
});

function makePlan(): DirectorSegmentPlan {
  return {
    version: "llm-prompt-chain-v1",
    format: "talking_head_cutaways",
    title: "Универсальная раскадровка",
    hookOptions: ["Как упростить поездки"],
    selectedHook: "Как упростить поездки",
    totalVoiceover: "С этим новым сервисом вы сможете экономить время в поездках каждый день",
    notes: null,
    segments: [
      {
        index: 1,
        durationSeconds: 4,
        voiceover: "С этим новым сервисом вы сможете",
        storyboardFrames: [
          makeFrame(1, "environment_cutaway", "С этим новым"),
          makeFrame(2, "product_cutaway", "сервисом вы сможете"),
        ],
        shots: [{ role: "cutaway", action: "Ведущий смотрит в камеру — кадр 1" }],
        productState: "сервис показан в кадре",
        endState: "движение продолжается",
      },
      {
        index: 2,
        durationSeconds: 4,
        voiceover: "экономить время в поездках каждый день",
        storyboardFrames: [
          makeFrame(1, "product_cutaway", "экономить время в"),
          makeFrame(2, "environment_cutaway", "поездках каждый день"),
        ],
        shots: [],
        productState: "сервис показан в кадре",
        endState: "история завершена",
      },
    ],
  };
}

function makeFrame(
  index: number,
  role: "environment_cutaway" | "product_cutaway",
  spokenWords: string
) {
  return {
    index,
    role,
    spokenWords,
    visualDescription: "Деталь поездки соответствует реплике",
    camera: "Плавное движение камеры",
    action: "В кадре происходит простое действие",
    productState: "сервис виден естественно",
    sfx: "естественный шум окружения",
    referenceRole: "product" as const,
  };
}
