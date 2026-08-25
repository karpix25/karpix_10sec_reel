import assert from "node:assert/strict";
import { test } from "node:test";

import type { DirectorSegmentPlan } from "./llm-prompt-chain-types";
import {
  buildCreativeCopywriterPrompt,
  type PromptChainInput,
} from "./llm-prompt-chain-prompts";
import {
  buildCreativeCopywriterAttemptPrompt,
  resolveCreativeCopywriterAttemptMode,
} from "./llm-prompt-chain-creative-repair";
import { buildReferenceMeaningContract } from "./reference-meaning-contract";
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

test("creative semantic failures keep every retry targeted", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((attempt) => resolveCreativeCopywriterAttemptMode({
      attempt,
      maxAttempts: 4,
      hasRejectedScript: attempt > 1,
    })),
    ["initial", "targeted_repair", "targeted_repair", "targeted_repair"]
  );

  const review = {
    version: "script-semantic-review-v1" as const,
    passed: false,
    productNamed: true,
    productValueStated: true,
    hookAnswered: false,
    finalAnswerPresent: false,
    productNaturallyIntegrated: false,
    referenceMeaningPreserved: true,
    evidence: { product: "Плати по миру", value: "оплачивать поездки", answer: "", transition: "в поездке удобно использовать" },
    issues: ["Хук не получает ответа"],
    repairInstructions: ["Добавьте ответ перед CTA"],
  };
  const rejectedScript = "Почему Австралия стала популярной? Плати по миру поможет в поездке. Ссылка в профиле.";
  const repairAttempt = buildCreativeCopywriterAttemptPrompt({
    chainInput: makeCreativeInput(),
    attempt: 2,
    maxAttempts: 4,
    previousDraft: {
      version: "llm-prompt-chain-v1",
      script: rejectedScript,
      hookAngle: null,
      creativeNotes: null,
    },
    semanticReview: review,
    failureReason: "semantic review failed",
  });

  assert.equal(repairAttempt.mode, "targeted_repair");
  assert.ok(repairAttempt.prompt.includes("Rejected script:"));
  assert.ok(repairAttempt.prompt.includes(rejectedScript));
  assert.ok(repairAttempt.prompt.includes("ответ на хук, завершенный вывод, причинная и нативная связь продукта"));
  assert.ok(repairAttempt.prompt.includes("Добавьте ответ перед CTA"));
  assert.ok(repairAttempt.prompt.includes("ровно столько различимых пунктов из reference"));
  assert.ok(repairAttempt.prompt.includes("Не возвращай rejected script без фактического исправления"));
  assert.ok(repairAttempt.prompt.includes("CTA должен завершать мысль о применении продукта"));

  const finalRepairAttempt = buildCreativeCopywriterAttemptPrompt({
    chainInput: makeCreativeInput(),
    attempt: 4,
    maxAttempts: 4,
    previousDraft: {
      version: "llm-prompt-chain-v1",
      script: rejectedScript,
      hookAngle: null,
      creativeNotes: null,
    },
    semanticReview: review,
    failureReason: "semantic review failed",
  });
  assert.equal(finalRepairAttempt.mode, "targeted_repair");
  assert.ok(finalRepairAttempt.prompt.includes("Rejected script:"));
  assert.ok(finalRepairAttempt.prompt.includes(rejectedScript));
});

test("reference list obligations are carried into the generator contract", () => {
  const reference = "Вот три совета для поездки. Во-первых, проверьте страховку. Во-вторых, следите за вещами на пляже. В-третьих, планируйте маршрут по погоде.";
  const contract = buildReferenceMeaningContract(reference);
  assert.equal(contract.requiresListPreservation, true);
  assert.equal(contract.listItems.length, 3);
  assert.ok(contract.listItems[1].includes("следите за вещами"));

  const prompt = buildCreativeCopywriterPrompt({
    ...makeCreativeInput(),
    sourceScenario: { ...makeCreativeInput().sourceScenario, script: reference },
  });
  assert.match(prompt, /сохрани каждый обязательный пункт по смыслу/iu);
  assert.ok(prompt.includes("следите за вещами на пляже"));
  assert.ok(prompt.includes("не упоминай описание, комментарии или кодовые слова"));
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

function makeCreativeInput(): PromptChainInput {
  return {
    projectName: "Плати помиру",
    targetAudience: "путешественники",
    brandVoice: "живой",
    productName: "Плати по миру",
    productDescription: "виртуальная карта для оплаты за границей",
    productReferenceNotes: null,
    ctaMode: "link_in_profile",
    ctaValue: null,
    sourceScenario: {
      id: 91,
      client_id: 1,
      script: "Австралия стала альтернативой Бали благодаря природе, климату и новым маршрутам.",
      title: "Почему Австралия стала популярной",
      topic: "путешествия",
      created_at: null,
      source_reference: null,
    },
    durationRange: {
      requestedMinSeconds: 30,
      requestedMaxSeconds: 30,
      minSeconds: 30,
      maxSeconds: 30,
      minWords: 65,
      maxWords: 80,
      source: "product_target",
      wasClamped: false,
    },
    avatarSpeechGender: "female",
  };
}
