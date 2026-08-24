import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-physical-scene-"));
const compiled = join(output, "compiled");
const config = join(output, "tsconfig.json");
const globals = join(output, "globals.d.ts");
const require = createRequire(import.meta.url);

try {
  writeFileSync(globals, "declare const process: { env: Record<string, string | undefined> };\n");
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      baseUrl: join(ui, "src"),
      paths: { "@/*": ["*"] },
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: [
      globals,
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/physical-scene-validator.ts"),
      join(ui, "src/lib/server/omni/physical-storyboard-normalizer.ts"),
      join(ui, "src/lib/server/omni/omni-physical-repair-pipeline.ts"),
      join(ui, "src/lib/server/omni/storyboard/storyboard-contract-validator.ts"),
      join(ui, "src/lib/server/omni/storyboard/omni-stored-storyboard-frame-repair.ts"),
      join(ui, "src/lib/server/omni/storyboard/omni-storyboard-builder.ts"),
      join(ui, "src/lib/server/omni/storyboard/omni-storyboard-speech.ts"),
      join(ui, "src/lib/server/omni/storyboard-vision-contract.ts"),
      join(ui, "src/lib/server/omni/storyboard-repair-limit.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const validator = require(findFile(compiled, "physical-scene-validator.js"));
  const physicalModel = require(findFile(compiled, "physical-scene-model.js"));
  const normalizer = require(findFile(compiled, "physical-storyboard-normalizer.js"));
  const repairPipeline = require(findFile(compiled, "omni-physical-repair-pipeline.js"));
  const contractValidator = require(findFile(compiled, "storyboard-contract-validator.js"));
  const referenceTransfer = require(findFile(compiled, "omni-reference-transfer-policy.js"));
  const speech = require(findFile(compiled, "omni-storyboard-speech.js"));
  const storedFrameRepair = require(findFile(compiled, "omni-stored-storyboard-frame-repair.js"));
  const storyboardBuilder = require(findFile(compiled, "omni-storyboard-builder.js"));
  const digitalProductScene = require(findFile(compiled, "digital-product-scene.js"));
  const storyboardVisionContract = require(findFile(compiled, "storyboard-vision-contract.js"));
  const storyboardRepairLimit = require(findFile(compiled, "storyboard-repair-limit.js"));

  assert.equal(storyboardRepairLimit.canAttemptStoryboardImageGeneration(2), true);
  assert.equal(storyboardRepairLimit.canAttemptStoryboardImageGeneration(3), false);
  assert.deepEqual(
    storyboardRepairLimit.resolveStoryboardImageGenerationAttempt({
      previousAttemptCount: 3,
      pendingKieTaskId: "already-paid-task",
      usesKie: true,
    }),
    { shouldAttempt: true, resumesPendingKieTask: true, generationAttemptCount: 3 }
  );
  assert.equal(
    storyboardVisionContract.normalizeStoryboardVisionValidation({
      confidence: 0.9,
      panels: [{ panel_index: 1, status: "repair", violations: [{ severity: "warning", code: "SOFT_LIGHT", evidence: "Minor" }] }],
    }).status,
    "pass"
  );
  assert.match(
    digitalProductScene.buildDigitalProductDemoStep({
      productName: "Плати по миру виртуальная карта",
      frameIndex: 3,
      frameCount: 5,
    }).placement,
    /Плати по миру виртуальная карта/iu
  );

  const handConflictPlan = physicalModel.buildPhysicalFramePlan({
    productName: "Коллаген",
    spokenText: "Например вот этот",
    visualAction: "касается обеих щек; герой держит Коллаген в одной руке",
    camera: "средний план",
    productPlacement: "Коллаген в одной руке",
  });
  assert.equal(handConflictPlan.requiredHands, 2);
  assert.equal(handConflictPlan.occupiedHandCount, 1);
  assert.match(
    physicalModel.repairPhysicalFrameAction({
      productName: "Коллаген",
      visualAction: "касается обеих щек; герой держит Коллаген в одной руке",
      plan: handConflictPlan,
    }),
    /одной щеки/iu
  );
  assert.match(
    physicalModel.repairReferenceAction({
      action: "ведет машину и кусает морковь",
      spokenText: "Показываю свой перекус",
      productName: "Коллаген",
      productVisible: true,
    }),
    /держит Коллаген в одной руке/iu
  );
  assert.match(
    physicalModel.repairReferenceAction({
      action: "кусает морковь",
      spokenText: "Рассказываю о составе",
      productName: "Коллаген",
      productVisible: false,
    }),
    /нейтральным жестом/iu
  );
  assert.equal(physicalModel.hasConsumptionAction("liquid pours from a stick pack at her lips into mouth"), true);
  assert.match(
    physicalModel.repairReferenceAction({
      action: "liquid pours from a stick pack at her lips into mouth",
      spokenText: "Рассказываю о составе",
      productName: "Коллаген",
      productVisible: true,
    }),
    /без приёма пищи/iu
  );
  const foodReferencePolicy = referenceTransfer.buildReferenceTransferPolicy({
    hasProductReference: true,
    directorBrief: {
      visual_transfer: {
        camera_composition: "phone camera from the side, lap and containers stay in the lower frame",
        props: [
          { role: "proof_prop", description: "food container on the lap", visible_from_start: true },
          { role: "support_prop", description: "carrot sticks", visible_from_start: false },
        ],
        action_beats: [
          { timestamp_sec: 0, action: "holds the food container while speaking", required_prop: "food container on the lap" },
          { timestamp_sec: 8, action: "shows carrot sticks to the camera", required_prop: "carrot sticks" },
        ],
      },
    },
  });
  const foodHookFrame = referenceTransfer.buildReferenceTransferFramePlan({
    policy: foodReferencePolicy,
    spokenText: "Рассказываю о полезном перекусе",
    productName: "Коллаген",
    productVisible: false,
    position: 0,
  });
  assert.match(foodHookFrame.cameraComposition, /lap and containers/iu);
  assert.deepEqual(foodHookFrame.requiredSupportProps, ["food container on the lap"]);
  const foodActionFrame = referenceTransfer.buildReferenceTransferFramePlan({
    policy: foodReferencePolicy,
    spokenText: "Рассказываю о полезном перекусе",
    productName: "Коллаген",
    productVisible: false,
    position: 1,
  });
  assert.ok(foodActionFrame.requiredSupportProps.includes("carrot sticks"));
  assert.match(
    physicalModel.repairReferenceAction({
      action: "герой показывает морковные палочки в камеру",
      spokenText: "Рассказываю о полезном перекусе",
      productName: "Коллаген",
      productVisible: false,
      referenceSupportProps: ["морковные палочки"],
    }),
    /морковные палочки/iu
  );
  const foodStoryboard = storyboardBuilder.buildStoryboardFromCreativePlan({
    plan: {
      segmentIndex: 1,
      lifeFormatId: "moving_vlog",
      speechStartsAtSeconds: 0,
      voiceoverText: "Когда времени мало полезный перекус лучше собрать заранее",
      productRole: "hidden",
      continuityProps: [],
      beats: [
        { startSeconds: 0, endSeconds: 2, action: "герой говорит в камеру" },
        { startSeconds: 2, endSeconds: 4, action: "герой говорит в камеру" },
        { startSeconds: 4, endSeconds: 6, action: "герой говорит в камеру" },
      ],
    },
    productName: "Коллаген",
    characterContract: {
      identityLine: "главный персонаж",
      clothingLine: "черная куртка",
      sourceRuleLine: "фиксированный образ",
      clothingSource: "fallback",
      speechGender: "female",
      speechGenderLine: "женский род",
    },
    segmentIndex: 1,
    durationSeconds: 4,
    directorBrief: directorBriefWithFoodProps(),
    referenceTransferPolicy: foodReferencePolicy,
  });
  assert.match(foodStoryboard.frames[0].camera, /lap and containers/iu);
  assert.match(foodStoryboard.frames[0].productPlacement, /food container on the lap/iu);
  assert.match(foodStoryboard.frames[1].productPlacement, /carrot sticks/iu);
  assert.match(foodStoryboard.frames[1].visualAction, /carrot sticks/iu);
  assert.equal(
    contractValidator.validateStoryboardSegmentContract({
      storyboard: foodStoryboard,
      contract: {
        productName: "Коллаген",
        productVisibility: "hidden",
        fixedWardrobe: foodStoryboard.frames[0].wardrobe,
      },
    }).valid,
    true
  );
  const hybridStoryboard = storyboardBuilder.buildStoryboardFromCreativePlan({
    plan: {
      segmentIndex: 1,
      lifeFormatId: "talking_head_cutaways",
      speechStartsAtSeconds: 0,
      voiceoverText: "Сначала объясняю проблему а затем показываю решение",
      productRole: "hidden",
      continuityProps: [],
      beats: [
        { startSeconds: 0, endSeconds: 2, action: "аватар говорит в камеру" },
        { startSeconds: 2, endSeconds: 4, action: "самостоятельная B-roll сцена" },
      ],
    },
    productName: "Коллаген",
    characterContract: {
      identityLine: "главный персонаж",
      clothingLine: "черная куртка",
      sourceRuleLine: "фиксированный образ",
      clothingSource: "fallback",
      speechGender: "female",
      speechGenderLine: "женский род",
    },
    segmentIndex: 1,
    durationSeconds: 4,
    directorBrief: {
      ...directorBriefWithFoodProps(),
      camera_timeline: [
        { start_sec: 0, end_sec: 2, shot_types: ["medium"], angles: ["front"], movements: [], stabilization: "stable", setting: "room", environment: "desk", lighting: "daylight", action_description: "speaks to camera", actor_gesture: "calm gesture", speech_mode: "on_camera" },
        { start_sec: 2, end_sec: 4, shot_types: ["macro"], angles: ["top down"], movements: [], stabilization: "stable", setting: "desk", environment: "product surface", lighting: "daylight", action_description: "independent B-roll insert", actor_gesture: "hands arrange objects", speech_mode: "voiceover_only" },
      ],
    },
    referenceTransferPolicy: foodReferencePolicy,
  });
  assert.deepEqual(hybridStoryboard.frames.map((item) => item.speechMode), ["on_camera", "voiceover_only"]);
  assert.match(hybridStoryboard.frames[1].visualAction, /B-roll|за кадром/iu);
  assert.match(
    physicalModel.repairReferenceAction({
      action: "держит чужую бутылку с яркой этикеткой",
      spokenText: "Рассказываю о составе",
      productName: "Коллаген",
      productVisible: false,
    }),
    /без чужих продуктов и упаковок/iu
  );
  assert.match(
    physicalModel.repairReferenceAction({
      action: "держит чужую бутылку с яркой этикеткой",
      spokenText: "Вот мой продукт",
      productName: "Коллаген",
      productVisible: true,
    }),
    /держит Коллаген в одной руке/iu
  );
  assert.match(
    physicalModel.normalizeVehicleContext("герой driving в машине"),
    /пассажир/iu
  );

  const speechChunks = speech.splitStoryboardSpeech(
    "Также из белка строится наша кожа. Все рецепторы работают лучше. Белка в рационе часто не хватает.",
    4
  );
  assert.equal(speechChunks.length, 4);
  assert.ok(!speechChunks.some((chunk) => /(?:^|\s)(?:наша|а|и)\s*$/iu.test(chunk)));

  const safe = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Вот крем, он спокойно стоит на столе", "герой говорит в камеру", "крем на столе"),
    ]),
    creativePlan: null,
    productName: "Крем",
  });
  assert.equal(safe.valid, true);

  const teleportingProduct = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Рассказываю о составе", "герой говорит в камеру", "продукт вне кадра"),
      frame("Это помогает держать ритм", "герой держит Коллаген в одной руке", "Коллаген в одной руке"),
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.ok(teleportingProduct.errors.includes("frame_2_product_teleports_between_frames"));

  const hybridEditorialCut = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Объясняю идею", "аватар спокойно говорит в камеру", "продукт вне кадра"),
      {
        ...frame("Вот как это выглядит на практике", "самостоятельная B-roll сцена: смартфон лежит на столе", "Коллаген на столе", "макро B-roll"),
        speechMode: "voiceover_only",
      },
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(hybridEditorialCut.valid, true, JSON.stringify(hybridEditorialCut));

  const meaninglessFaceTouch = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Рассказываю о составе", "герой касается обеих щек", "продукт вне кадра"),
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.ok(meaninglessFaceTouch.errors.includes("frame_1_face_touch_without_spoken_reason"));

  const physicalDemoSteps = [1, 2, 3].map((frameIndex) => physicalModel.buildPhysicalProductDemoStep({
    productName: "Коллаген",
    frameIndex,
    frameCount: 3,
  }));
  const physicalDemo = validator.validatePhysicalScene({
    storyboard: storyboard(physicalDemoSteps.map((step) =>
      frame("Рассказываю, почему это удобно", step.action, step.placement)
    )),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(physicalDemo.valid, true, JSON.stringify(physicalDemo));
  assert.match(physicalDemoSteps[0].action, /жестикулирует/iu);
  assert.match(physicalDemoSteps[1].action, /берет Коллаген.*поднимает/iu);
  assert.match(physicalDemoSteps[2].action, /держит Коллаген.*поворачивает/iu);
  const fivePanelDemoSteps = [1, 2, 3, 4, 5].map((frameIndex) => physicalModel.buildPhysicalProductDemoStep({
    productName: "Коллаген",
    frameIndex,
    frameCount: 5,
  }));
  assert.match(fivePanelDemoSteps[0].placement, /стоит на видимой поверхности/iu);
  assert.match(fivePanelDemoSteps[1].action, /тянется к Коллаген/iu);
  assert.match(fivePanelDemoSteps[2].action, /касается Коллаген/iu);
  assert.match(fivePanelDemoSteps[2].placement, /не поднимает/iu);
  assert.match(fivePanelDemoSteps[3].action, /берет Коллаген.*поднимает/iu);
  assert.match(fivePanelDemoSteps[4].action, /держит Коллаген.*поворачивает/iu);
  const firstDemoPlan = physicalModel.buildPhysicalFramePlan({
    productName: "Коллаген",
    spokenText: "Рассказываю, почему это удобно",
    visualAction: physicalDemoSteps[0].action,
    camera: "средний план",
    productPlacement: physicalDemoSteps[0].placement,
  });
  assert.equal(firstDemoPlan.productState, "surface");
  assert.equal(firstDemoPlan.actionKind, "neutral_speech", "initial product position must not be parsed as put_down");

  const digitalStoryboard = storyboardBuilder.buildStoryboardFromCreativePlan({
    plan: {
      segmentIndex: 1,
      lifeFormatId: "talking_head_cutaways",
      speechStartsAtSeconds: 0,
      voiceoverText: "Покажу мобильное приложение чтобы спокойно платить за границей без лишних сложностей и заранее проверить всё перед поездкой",
      productRole: "digital_demo",
      continuityProps: [],
      beats: [
        { startSeconds: 0, endSeconds: 3, action: "герой спокойно говорит в камеру" },
        { startSeconds: 3, endSeconds: 7, action: "герой показывает экран смартфона" },
        { startSeconds: 7, endSeconds: 10, action: "герой продолжает объяснение" },
      ],
    },
    productName: "Плати по миру виртуальная карта",
    characterContract: {
      identityLine: "главный персонаж",
      clothingLine: "черная куртка",
      sourceRuleLine: "фиксированный образ",
      clothingSource: "fallback",
      speechGender: "male",
      speechGenderLine: "мужской род",
    },
    segmentIndex: 1,
    durationSeconds: 10,
  });
  assert.ok(digitalStoryboard.frames.some((item) => /поднимает смартфон.*одной руке/iu.test(item.visualAction)));
  assert.ok(digitalStoryboard.frames.every((item) => !/смартфон|телефон/iu.test(item.productPlacement) || !/столе|поверхности|лежит|стоит/iu.test(item.productPlacement)));
  const digitalValidation = validator.validatePhysicalScene({
    storyboard: digitalStoryboard,
    creativePlan: { productRole: "digital_demo", beats: [] },
    productName: "Плати по миру виртуальная карта",
  });
  assert.equal(digitalValidation.valid, true, JSON.stringify(digitalValidation));
  const repairedDigitalPlan = repairPipeline.normalizeOmniPromptPlanWithPhysicalRules({
    promptPlan: [{
      index: 1,
      role: "body",
      prompt: "",
      referenceUrl: null,
      durationSeconds: 10,
      voiceoverText: digitalStoryboard.voiceoverText,
      storyboardPlan: storyboard([1, 2].map((index) => frame(
        "Рассказываю о приложении",
        "герой держит смартфон в одной руке",
        "смартфон в одной руке"
      ))),
      storyboardValidation: null,
      creativeStrategy: {},
      creativePlan: { productRole: "digital_demo", beats: [] },
      validation: { valid: false, score: 0, errors: ["frame_3_digital_product_without_phone_screen"], warnings: [] },
    }],
    productName: "Плати по миру виртуальная карта",
    segmentCount: 1,
  });
  assert.equal(repairedDigitalPlan[0].validation.valid, true, JSON.stringify(repairedDigitalPlan[0].validation));
  assert.match(repairedDigitalPlan[0].storyboardPlan.frames[1].productPlacement, /экран.*камере/iu);
  assert.ok(
    validator.validatePhysicalScene({
      storyboard: storyboard([frame("Покажу приложение", "герой показывает экран смартфона", "смартфон стоит на столе")]),
      creativePlan: { productRole: "digital_demo", beats: [] },
      productName: "Плати по миру виртуальная карта",
    }).errors.includes("frame_1_digital_product_on_surface")
  );

  const biteWhileSpeaking = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Вот мой перекус", "герой говорит в камеру и кусает морковь", "морковь в руке"),
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.ok(biteWhileSpeaking.errors.includes("frame_1_speech_during_consumption"));

  const identityMismatch = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Показываю сыр", "герой держит морковь", "морковь в руке"),
    ]),
    creativePlan: null,
    productName: "Перекус",
  });
  assert.ok(identityMismatch.errors.includes("frame_1_object_identity_mismatch"));

  const multipleObjects = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Показываю продукт", "герой держит перекус и коллаген", "коллаген в руке"),
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.ok(multipleObjects.errors.includes("frame_1_multiple_held_objects"));

  const voiceoverCutaway = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Это помогает держать ритм", "короткая перебивка: герой кусает морковь", "морковь на столе", "крупный кадр"),
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(voiceoverCutaway.valid, true);

  const productContractWithUsageWord = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Рассказываю о составе", "герой спокойно говорит в камеру", "Коллаген стоит на столе; принимать внутрь по инструкции"),
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(productContractWithUsageWord.valid, true);

  const oneHeldProductWithDescriptor = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Рассказываю о составе", "герой спокойно говорит в камеру", "Коллаген в одной руке, без других продуктов и упаковок"),
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(oneHeldProductWithDescriptor.valid, true);

  const repairedStoredFrame = storedFrameRepair.buildStoredStoryboardFrame({
    frame: {
      index: 2,
      role: "product_cutaway",
      spokenWords: "Рассказываю о составе",
      visualDescription: "герой кусает морковь и держит сыр и Коллаген",
      camera: "средний план",
      action: "ест перекус",
      productState: "держит морковь и Коллаген в руках",
      sfx: "слышно жевание",
      referenceRole: "product",
    },
    productName: "Коллаген",
    productVisible: true,
  });
  assert.doesNotMatch(repairedStoredFrame.visualAction, /кус(?:ает|ать)|жует|сыр|морков/iu);
  assert.doesNotMatch(repairedStoredFrame.productPlacement, /морков|сыр|несколько|два предмета/iu);
  assert.doesNotMatch(repairedStoredFrame.sfxNotes, /жев|кус/iu);
  const repairedStoredValidation = validator.validatePhysicalScene({
    storyboard: storyboard([repairedStoredFrame]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(repairedStoredValidation.valid, true, repairedStoredValidation.errors.join(", "));

  const composedStoredFrame = storedFrameRepair.buildStoredStoryboardFrame({
    frame: {
      index: 1,
      role: "environment_cutaway",
      spokenWords: "Это помогает выбрать маршрут",
      visualDescription: "панорамный вид на тропический пляж",
      camera: "широкий план",
      action: "плавная панорама",
      productState: "вне кадра",
      sfx: "шум волн",
      referenceRole: "avatar",
    },
    productName: "Плати по миру виртуальная карта",
    productVisible: false,
    referenceTransferPolicy: {
      ...referenceTransfer.DEFAULT_REFERENCE_TRANSFER_POLICY,
      visualContract: {
        cameraComposition: "presenter centered over full frame travel background",
        persistentSupportProps: [],
        actionBeats: [],
      },
    },
  });
  assert.match(composedStoredFrame.camera, /КОМПОЗИЦИЯ REFERENCE: presenter centered over full frame travel background/u);
  assert.equal(
    contractValidator.validateStoryboardSegmentContract({
      storyboard: storyboard([composedStoredFrame]),
      contract: { productName: "Плати по миру виртуальная карта", productVisibility: "hidden" },
    }).errors.includes("frame_1_reference_composition_missing"),
    false,
  );

  const foreignSpeechFrame = storedFrameRepair.buildStoredStoryboardFrame({
    frame: {
      index: 2,
      role: "face_return",
      spokenWords: "Показываю сыр",
      visualDescription: "герой держит Коллаген в руке",
      camera: "средний план",
      action: "показывает продукт",
      productState: "Коллаген в руке",
      sfx: null,
      referenceRole: "product",
    },
    productName: "Коллаген",
    productVisible: false,
  });
  assert.match(foreignSpeechFrame.productPlacement, /тематические объекты и окружение|вне кадра/iu);
  assert.equal(
    validator.validatePhysicalScene({
      storyboard: storyboard([foreignSpeechFrame]),
      creativePlan: null,
      productName: "Коллаген",
    }).valid,
    true
  );

  const normalizedConflict = normalizer.normalizePhysicalStoryboardSegment({
    productName: "Коллаген",
    productVisible: true,
    storyboard: storyboard([
      frame(
        "Рассказываю о составе продукта",
        "обе руки у лица, герой кусает морковь и ведет машину",
        "держит сыр и Коллаген в руках",
        "средний план в движущейся машине"
      ),
    ]),
  });
  const normalizedConflictValidation = validator.validatePhysicalScene({
    storyboard: normalizedConflict,
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(normalizedConflictValidation.valid, true, JSON.stringify(normalizedConflictValidation));
  assert.match(normalizedConflict.frames[0].visualAction, /пассажир.*движущемся автомобиле/iu);
  assert.doesNotMatch(normalizedConflict.frames[0].visualAction, /кус(?:ает|ать)|обе\s+руки\s+у\s+лица/iu);
  assert.doesNotMatch(normalizedConflict.frames[0].productPlacement, /сыр|несколько|два\s+предмета/iu);

  const passengerValidation = validator.validatePhysicalScene({
    storyboard: storyboard([
      {
        ...frame(
          "Говорю в камеру",
          "герой едет пассажиром и спокойно говорит в камеру",
          "продукт вне кадра",
          "ручная камера в движущемся автомобиле"
        ),
        environment: "машина едет",
      },
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(passengerValidation.valid, true, JSON.stringify(passengerValidation));

  const staleProduct = normalizer.normalizePhysicalStoryboardSegment({
    productName: "Коллаген",
    productVisible: true,
    storyboard: storyboard([
      frame(
        "Вот этот Коллаген удобно брать с собой",
        "герой держит Коллаген в одной руке",
        "Коллаген в одной руке, упаковка повернута к камере"
      ),
      frame(
        "Соблюдайте эти правила хотя бы тридцать дней",
        "герой держит Коллаген в одной руке",
        "Коллаген в одной руке, упаковка повернута к камере"
      ),
    ]),
  });
  assert.match(staleProduct.frames[1].productPlacement, /Коллаген/iu);
  assert.match(staleProduct.frames[0].visualAction, /не касаются упаковки/iu);
  assert.match(staleProduct.frames[1].visualAction, /берет Коллаген.*поднимает/iu);

  const canonicalDemo = normalizer.normalizePhysicalStoryboardSegment({
    productName: "Коллаген",
    productVisible: true,
    storyboard: storyboard([
      frame("Сначала объясняю", "герой держит Коллаген", "Коллаген на столе"),
      frame("Потом показываю", "герой держит Коллаген", "Коллаген на столе"),
      frame("Рассказываю дальше", "герой держит Коллаген", "Коллаген на столе"),
      frame("Объясняю состав", "герой держит Коллаген", "Коллаген на столе"),
      frame("Завершаю мысль", "герой держит Коллаген", "Коллаген на столе"),
    ]),
  });
  const canonicalDemoValidation = validator.validatePhysicalScene({
    storyboard: canonicalDemo,
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(canonicalDemoValidation.valid, true, JSON.stringify(canonicalDemoValidation));
  assert.match(canonicalDemo.frames[0].visualAction, /не касаются упаковки/iu);
  assert.match(canonicalDemo.frames[2].visualAction, /касается Коллаген/iu);
  assert.match(canonicalDemo.frames[3].visualAction, /берет Коллаген.*поднимает/iu);
  assert.match(canonicalDemo.frames[4].visualAction, /держит Коллаген.*поворачивает/iu);
  assert.doesNotMatch(canonicalDemo.frames[0].visualAction, /держит Коллаген/iu);

  const hiddenCtaTransfer = normalizer.normalizePhysicalStoryboardSegment({
    productName: "Geodemika Enzyme Cleansing Foam",
    productVisible: false,
    storyboard: storyboard([
      {
        ...frame(
          "Артикул Geodemika Enzyme Cleansing Foam в описании",
          "герой держит Geodemika Enzyme Cleansing Foam в одной руке",
          "Geodemika Enzyme Cleansing Foam в одной руке"
        ),
        referenceTransfer: {
          version: "reference-transfer-v2",
          productMeaningfulBeat: true,
          visualCue: "показывает продукт",
          decisions: {
            layout: "preserve",
            camera: "preserve",
            lighting: "preserve",
            editLanguage: "preserve",
            wardrobe: "preserve",
            environment: "preserve",
            presenterAction: "adapt_action",
            sourceProduct: "replace_with_product",
            sourceProps: "preserve_as_support",
            overlays: "remove",
          },
        },
      },
    ]),
  });
  assert.equal(hiddenCtaTransfer.frames[0].referenceTransfer.productMentioned, true);
  assert.equal(hiddenCtaTransfer.frames[0].referenceTransfer.productMeaningfulBeat, false);
  assert.equal(hiddenCtaTransfer.frames[0].referenceTransfer.decisions.sourceProduct, "remove");
  assert.equal(
    contractValidator.validateStoryboardSegmentContract({
      storyboard: hiddenCtaTransfer,
      contract: {
        productName: "Geodemika Enzyme Cleansing Foam",
        productVisibility: "hidden",
        fixedWardrobe: "одежда",
      },
    }).valid,
    true
  );

  const ordinaryReferenceSpeech = storyboard([
    {
      ...frame(
        "Выбирайте удобный формат",
        "герой спокойно говорит в камеру с нейтральным жестом",
        "продукт вне кадра"
      ),
      referenceTransfer: {
        ...hiddenCtaTransfer.frames[0].referenceTransfer,
        version: "reference-transfer-v3",
        requiredReferenceAction: "Presenter speaks to the camera with hands clasped.",
      },
    },
  ]);
  assert.equal(
    contractValidator.validateStoryboardSegmentContract({
      storyboard: ordinaryReferenceSpeech,
      contract: {
        productName: "Коллаген",
        productVisibility: "hidden",
        fixedWardrobe: "одежда",
      },
    }).valid,
    true
  );

  const normalizedCheekAction = normalizer.normalizePhysicalStoryboardSegment({
    productName: "Коллаген",
    productVisible: true,
    storyboard: storyboard([
      frame(
        "Коллаген помогает коже",
        "Both hands move up to touch jawline and cheeks",
        "Коллаген обязательно физически виден в коротком действии с рукой"
      ),
    ]),
  });
  assert.match(normalizedCheekAction.frames[0].visualAction, /одной щек/iu);
  assert.equal(
    validator.validatePhysicalScene({
      storyboard: normalizedCheekAction,
      creativePlan: null,
      productName: "Коллаген",
    }).valid,
    true
  );

  console.log("Omni physical scene validator checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function storyboard(frames) {
  return { segmentIndex: 1, durationSeconds: 4, voiceoverText: frames.map((item) => item.spokenText).join(" "), frames };
}

function frame(spokenText, visualAction, productPlacement, camera = "средний план") {
  return { spokenText, visualAction, camera, environment: "комната", wardrobe: "одежда", productPlacement, sfxNotes: "естественный звук" };
}

function directorBriefWithFoodProps() {
  return {
    visual_hook: { action: "food container on lap", retention_trigger: "road snack" },
    atmosphere: { mood: "casual", lighting: "daylight", color_grading: "natural", setting: "car passenger seat" },
    clothing: { style: "black jacket", color_palette: ["black"], fit_details: "casual", source: "reference" },
    camera: { shot_types: ["phone medium shot"], angles: ["side angle"], movements: ["handheld"], stabilization: "handheld" },
    montage_rhythm: { cut_pace: "natural", beat_sync: "speech", transition_style: ["hard cuts"] },
    action_beats: [],
    prop_sources: [],
    hand_object_interactions: [],
    motion_continuity: [],
    reference_action_style: "casual vlog",
    reusable_mechanics: { visual_mechanics: ["proof prop"], safe_zones_for_elements: "none", looping_pattern: "none" },
    visual_transfer: {
      camera_composition: "phone camera from the side, lap and containers stay in the lower frame",
      props: [
        { role: "proof_prop", description: "food container on the lap", visible_from_start: true },
        { role: "support_prop", description: "carrot sticks", visible_from_start: false },
      ],
      action_beats: [
        { timestamp_sec: 0, action: "holds the food container while speaking", required_prop: "food container on the lap" },
        { timestamp_sec: 8, action: "shows carrot sticks to the camera", required_prop: "carrot sticks" },
      ],
    },
  };
}

function findFile(directory, fileName) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      try { return findFile(path, fileName); } catch { continue; }
    }
    if (entry.name === fileName) return path;
  }
  throw new Error(`Could not find ${fileName}`);
}
