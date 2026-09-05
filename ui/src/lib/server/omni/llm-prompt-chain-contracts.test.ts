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
import { normalizeGroundedSemanticReview } from "./script-semantic-findings";
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

test("one targeted repair preserves draft and receives every confirmed issue", () => {
  assert.equal(resolveCreativeCopywriterAttemptMode({ attempt: 1, maxAttempts: 2, hasRejectedScript: false }), "initial");
  const rejectedScript = "Почему Австралия стала популярной? Плати по миру поможет в поездке. Ссылка в профиле.";
  const attempt = buildCreativeCopywriterAttemptPrompt({
    chainInput: makeCreativeInput(), attempt: 2, maxAttempts: 2,
    previousDraft: { version: "llm-prompt-chain-v1", script: rejectedScript, hookAngle: null, creativeNotes: null },
    semanticReview: null,
    failureReason: "Речь не помещается в сегмент.",
  });
  assert.equal(attempt.mode, "targeted_repair");
  assert.ok(attempt.prompt.includes(rejectedScript));
  assert.ok(attempt.prompt.includes("Речь не помещается в сегмент."));
  assert.match(attempt.prompt, /Тему, порядок, примеры и факты reference можно свободно переписать/u);
  assert.match(attempt.prompt, /полный исправленный JSON с segments, duration_seconds и voiceover/u);
});

test("legacy adaptation modes keep one fact-based rewrite task", () => {
  const input = makeCreativeInput();
  const reference = "Вот три совета для поездки. Проверьте страховку. Следите за вещами на пляже. Планируйте маршрут по погоде.";
  const prompts = (["preserve_reference", "adjacent_bridge", "format_transfer"] as const).map((mode) =>
    buildCreativeCopywriterPrompt({ ...input,
      sourceScenario: { ...input.sourceScenario, script: reference },
      adaptationPlan: { ...input.adaptationPlan, mode },
    }));
  assert.equal(new Set(prompts).size, 1, "legacy topic classifier must not switch generation strategies");
  assert.ok(prompts[0].includes(reference));
  assert.match(prompts[0], /новый разговорный сценарий на тему reference/u);
  assert.match(prompts[0], /Ты можешь менять порядок, примеры, список, числа, названия и вывод/u);
  assert.match(prompts[0], /Верни только JSON с массивом segments/u);
  assert.match(prompts[0], /четыре слова на две секунды/u);
  assert.doesNotMatch(prompts[0], /Полностью замени исходный предмет|СОСЕДНЕГО МОСТА/u);
});

test("reference answers can be freely reinterpreted", () => {
  const context = { productName: "Плати по миру",
    referenceScript: "Это Республика Палау. Оформление визы занимает пять минут онлайн.",
    script: "Это единственная страна, где туристическая виза стоит один доллар. Оформление визы занимает пять минут онлайн. Плати по миру помогает оплачивать покупки. Ссылка в профиле.",
  };
  const evidence = { product: "Плати по миру", value: "помогает оплачивать покупки",
    answer: "Оформление визы занимает пять минут онлайн", answerKind: "named_fact",
    referenceAnswer: "Это Республика Палау", expectedAnswer: "Палау", transition: "" };
  assert.equal(normalizeGroundedSemanticReview({ evidence, defects: [], warnings: [] }, context).passed, true);
});

test("exact product facts override unsupported-claim allegations without excusing invented claims", () => {
  const context = { productName: "Плати по миру", productDescription: "Карта помогает оплачивать покупки.",
    referenceScript: "Это Тунис.",
    script: "Это Тунис. Плати по миру помогает оплачивать покупки и получать кэшбэк.",
  };
  const evidence = { product: "Плати по миру", value: "помогает оплачивать покупки", answer: "Тунис",
    answerKind: "named_fact", referenceAnswer: "Это Тунис", expectedAnswer: "Тунис", transition: "" };
  const review = (expectedText: string) => normalizeGroundedSemanticReview({ evidence, warnings: [],
    defects: [{ code: "unsupported_product_claim", scriptQuote: "помогает оплачивать покупки и получать кэшбэк",
      expectedText, message: "Свойство не подтверждено описанием" }],
  }, context);
  assert.equal(review("оплачивать покупки").passed, true);
  assert.equal(review("получать кэшбэк").passed, false);
});

test("reference lists are optional material for adaptation", () => {
  const context = { productName: "Плати по миру",
    referenceScript: "Три совета: проверьте страховку, следите за вещами, планируйте маршрут.",
    script: "Проверьте страховку. Следите за вещами. Плати по миру помогает оплачивать покупки. Ссылка в профиле.",
  };
  const raw = { evidence: { product: "Плати по миру", value: "помогает оплачивать покупки",
    answer: "Проверьте страховку", answerKind: "explanation", referenceAnswer: "проверьте страховку", expectedAnswer: "страховку", transition: "" },
    defects: [{ code: "missing_list_item", message: "Потерян третий пункт",
      referenceQuote: "планируйте маршрут", expectedText: "маршрут", scriptQuote: "" }], warnings: [],
  };
  assert.equal(normalizeGroundedSemanticReview(raw, context).passed, true);
});

test("reference facts can be replaced with a new adaptation angle", () => {
  const context = { productName: "Карта", referenceScript: "Это Тунис.",
    script: "Отдых в Тунисе. Карта помогает в поездках." };
  const evidence = { product: "Карта", value: "помогает в поездках", answer: "Отдых в Тунисе",
    answerKind: "named_fact", referenceAnswer: "Это Тунис", expectedAnswer: "Тунис", transition: "" };
  assert.equal(normalizeGroundedSemanticReview({ evidence, defects: [], warnings: [] }, context).passed, true);
  const wrongCountry = normalizeGroundedSemanticReview({ evidence: { ...evidence, answer: "Отдых в Турции" }, defects: [], warnings: [] },
    { ...context, script: "Отдых в Турции. Карта помогает в поездках." });
  assert.equal(wrongCountry.passed, true);
});

test("source prices are not exact-answer gates", () => {
  const context = { productName: "Плати по миру",
    referenceScript: "176 1000 на двоих с полным питанием на Мальдивы.",
    script: "Сто семьдесят шесть тысяч рублей на двоих с полным питанием на Мальдивы. Плати по миру помогает платить за границей." };
  const evidence = { product: "Плати по миру", value: "помогает платить за границей",
    answer: "Сто семьдесят шесть тысяч рублей на двоих", answerKind: "named_fact",
    referenceAnswer: "176 1000 на двоих с полным питанием на Мальдивы",
    expectedAnswer: "176 1000 на двоих с полным питанием на Мальдивы", transition: "" };
  assert.equal(normalizeGroundedSemanticReview({ evidence, defects: [], warnings: [] }, context).passed, true);
  assert.equal(normalizeGroundedSemanticReview({ evidence, defects: [], warnings: [] },
    { ...context, script: context.script.replace("Сто семьдесят шесть тысяч", "Сто семьдесят пять тысяч") }).passed, true);
});

test("negated product descriptions never approve the positive version of a claim", () => {
  const context = { productName: "Карта", referenceScript: "Это Тунис.",
    script: "Это Тунис. Карта выдаёт кешбэк.", productDescription: "Карта не выдаёт кешбэк." };
  const evidence = { product: "Карта", value: "выдаёт кешбэк", answer: "Тунис", answerKind: "named_fact",
    referenceAnswer: "Это Тунис", expectedAnswer: "Тунис", transition: "" };
  const raw = { evidence, warnings: [], defects: [{ code: "unsupported_product_claim",
    scriptQuote: "Карта выдаёт кешбэк", expectedText: "выдаёт кешбэк", message: "Кешбэк не поддерживается." }] };
  const rejected = normalizeGroundedSemanticReview(raw, context);
  assert.deepEqual(rejected.defects?.map((defect) => defect.code), ["unsupported_product_claim"]);
  assert.equal(normalizeGroundedSemanticReview(raw, { ...context, productDescription: "Карта выдаёт кешбэк." }).passed, true);
});

test("freeform reviewer advice cannot leak through failureReason into the repair prompt", () => {
  const context = { productName: "Карта", referenceScript: "Это Тунис.", script: "Это Тунис. Карта выдаёт кешбэк." };
  const advice = "Добавь гарантированную скидку девяносто процентов и бесплатные перелёты.";
  const review = normalizeGroundedSemanticReview({ evidence: { product: "Карта", value: "выдаёт кешбэк",
    answer: "Тунис", answerKind: "named_fact", referenceAnswer: "Это Тунис", expectedAnswer: "Тунис", transition: "" },
    defects: [{ code: "unsupported_product_claim", scriptQuote: "Карта выдаёт кешбэк", expectedText: "выдаёт кешбэк", message: advice }], warnings: [],
  }, context);
  assert.equal(review.defects?.[0].message, advice, "raw explanation remains available only as diagnostic data");
  const repaired = buildCreativeCopywriterAttemptPrompt({
    chainInput: makeCreativeInput(), attempt: 2, maxAttempts: 2,
    previousDraft: { version: "llm-prompt-chain-v1", script: context.script, hookAngle: null, creativeNotes: null },
    semanticReview: review, failureReason: `Сценарий требует исправления: ${review.issues.join("; ")}`,
  });
  assert.equal(repaired.prompt.includes(advice), false);
  assert.match(repaired.prompt, /неподтверждённое свойство/iu);
});

test("combined named anchors and missing positive value evidence do not reject complete speech", () => {
  const context = { productName: "Карта", referenceScript: "Первый магазин Нива. Второй магазин Заря.",
    script: "Первый магазин называется Нива. Второй называется Заря. Карта помогает оплачивать покупки." };
  const evidence = { product: "Карта", value: "", answer: "Первый магазин называется Нива", answerKind: "named_fact",
    referenceAnswer: "Нива, Заря", expectedAnswer: "Нива, Заря", transition: "" };
  const review = normalizeGroundedSemanticReview({ evidence, defects: [], warnings: [] }, context);
  assert.equal(review.passed, true);
  assert.equal(review.productValueStated, true, "empty positive value evidence alone does not prove absence");
  const explicitMissingValue = normalizeGroundedSemanticReview({ evidence, warnings: [], defects: [{ code: "missing_product_value" }] }, context);
  assert.equal(explicitMissingValue.passed, false, "an explicit missing-value finding still blocks until resolved");
});

function makePlan(): DirectorSegmentPlan {
  return {
    version: "llm-prompt-chain-v1",
    format: "talking_head_cutaways",
    title: "Универсальная раскадровка",
    hookOptions: ["Как упростить поездки"],
    selectedHook: "Как упростить поездки",
    totalVoiceover: "С этим новым сервисом вы сможете экономить время в поездках каждый день без лишних сложностей сегодня",
    notes: null,
    segments: [
      {
        index: 1,
        durationSeconds: 4,
        voiceover: "С этим новым сервисом вы сможете экономить время",
        storyboardFrames: [
          makeFrame(1, "environment_cutaway", "С этим новым сервисом"),
          makeFrame(2, "product_cutaway", "вы сможете экономить время"),
        ],
        shots: [{ role: "cutaway", action: "Ведущий смотрит в камеру — кадр 1" }],
        productState: "сервис показан в кадре",
        endState: "движение продолжается",
      },
      {
        index: 2,
        durationSeconds: 4,
        voiceover: "в поездках каждый день без лишних сложностей сегодня",
        storyboardFrames: [
          makeFrame(1, "product_cutaway", "в поездках каждый день"),
          makeFrame(2, "environment_cutaway", "без лишних сложностей сегодня"),
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
    adaptationPlan: {
      version: "script-adaptation-v1",
      mode: "format_transfer",
      reason: "The reference mechanic can transfer to the product problem.",
      preserve: ["personal hook", "step by step reveal"],
      replace: ["unrelated source mechanism"],
      productBridge: "Connect the travel problem to the card benefit.",
      confidence: 0.9,
    },
  };
}
