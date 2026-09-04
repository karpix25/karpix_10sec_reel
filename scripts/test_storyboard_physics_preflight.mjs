import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "storyboard-physics-preflight-"));
const require = createRequire(import.meta.url);
const originalFetch = global.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;

try {
  const config = join(output, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022", module: "commonjs", moduleResolution: "node",
      baseUrl: join(ui, "src"), paths: { "@/*": ["*"] },
      rootDir: join(ui, "src"), outDir: output,
      strict: true, esModuleInterop: true, skipLibCheck: true,
      types: ["node"], typeRoots: [join(ui, "node_modules/@types")],
    },
    include: ["storyboard-vision-validator", "storyboard-set-vision-validator", "physical-scene-validator", "omni-avatar-reel-plan", "llm-prompt-chain-storyboard-validator"]
      .map((name) => join(ui, `src/lib/server/omni/${name}.ts`)),
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const load = (name) => require(join(output, `lib/server/omni/${name}.js`));
  const qa = load("storyboard-qa-contract");
  const vision = load("storyboard-vision-contract");
  const single = load("storyboard-vision-validator");
  const set = load("storyboard-set-vision-validator");
  const physical = load("physical-scene-validator");
  const physicalModel = load("physical-scene-model");
  const emptyHands = physicalModel.buildPhysicalFramePlan({
    productName: "Коллаген", spokenText: "Сначала выбираем состав спокойно",
    visualAction: "персонаж говорит в камеру, спокойный жест руками, без товара в кадре",
    camera: "средний крупный план", productPlacement: "в кадре тематические объекты и окружение текущей реплики",
    speechMode: "on_camera",
  });
  assert.equal(emptyHands.productState, "hidden", "an explicit absence of the product is not positive product evidence");
  assert.deepEqual(emptyHands.visibleEntityIds, []);
  const supportedProduct = physicalModel.buildPhysicalFramePlan({
    productName: "Коллаген", spokenText: "Теперь рассмотрим нашу упаковку",
    visualAction: "без чужих продуктов; Коллаген стоит на столе", camera: "крупный предметный план",
    productPlacement: "Коллаген на столе", speechMode: "voiceover_only",
  });
  assert.equal(supportedProduct.productState, "surface", "negating foreign products must not hide the visible client product");
  assert.equal(supportedProduct.visibleEntityIds.length, 1);
  const avatarReel = load("omni-avatar-reel-plan");
  const referencePlan = load("reference-segment-plan");
  const sourceValidator = load("llm-prompt-chain-storyboard-validator");
  const sceneMode = load("omni-reference-scene-mode");
  const safetyRules = require(join(output, "lib/omni/creative-contract.js")).OMNI_ACTION_SAFETY_RULES.join(" ");
  assert.doesNotMatch(safetyRules, /Open packaging|Do not use a product close-up/);
  assert.match(safetyRules, /without people, hands, or interaction/);
  assert.match(safetyRules, /back to the speaker while the same voiceover continues/);

  for (const [code, evidence] of [
    ["PRODUCT_SUPPORT_MISSING", "Panel 1 shows a clear air gap between the stationary jar base and the table."],
    ["PRODUCT_BROLL_HAS_HUMAN_INTERACTION", "A visible hand grips the jar in the standalone product panel."],
    ["PRODUCT_SCALE_MISMATCH", "The planned 10 cm jar is taller than the 90 cm door on the same depth plane."],
    ["OBJECT_INTERPENETRATION", "The solid jar base passes through the solid tabletop."],
  ]) {
    const violation = { code, severity: "error", evidence };
    const validation = vision.normalizeStoryboardVisionValidation({
      status: "pass", confidence: 0.95,
      panels: [{ panel_index: 1, status: "pass", violations: [violation] }],
    });
    assert.equal(validation.status, "repair", `${code} must survive a contradictory model pass`);
    assert.equal(qa.resolveStoryboardRepairMode([violation]), "patch");
    assert.equal(vision.getStoryboardVisionRepairInstructions(validation).length, 1);
    assert.deepEqual(set.getStoryboardSetRepairSegments(set.normalizeStoryboardSetVisionValidation({
      confidence: 0.95, violations: [{ ...violation, segment_index: 2, panels: [1] }],
    })), [2], `${code} must also block the normal multi-segment path`);
    for (const evidence of ["Support is outside the crop and cannot verify the base.", "", "No evidence provided"]) {
      assert.equal(qa.isBlockingStoryboardQaViolation({ ...violation, evidence }), false);
    }
    assert.equal(qa.isBlockingStoryboardQaViolation({ ...violation, severity: "warning" }), false);
  }

  const montageCuts = vision.normalizeStoryboardVisionValidation({
    status: "block", confidence: 0.95,
    panels: [{ panel_index: 1, status: "block", violations: [
      { code: "OBJECT_TELEPORTATION", severity: "error", evidence: "The jar appears after a cut from the avatar." },
      { code: "CAMERA_CHANGE", severity: "error", evidence: "The next panel has a closer angle." },
    ] }], repair_instructions: ["Remove the cut"],
  });
  assert.equal(montageCuts.status, "pass");
  assert.deepEqual(montageCuts.repairInstructions, []);

  const avatar = frame("Герой говорит в камеру", "продукт вне кадра", "on_camera");
  const product = frame("Коллаген стоит на столе", "Коллаген на столе", "voiceover_only", "макро B-roll");
  const storyboard = { segmentIndex: 1, durationSeconds: 6, voiceoverText: "Состав помогает выбрать подходящий вариант", frames: [avatar, product, avatar] };
  const validMontage = physical.validatePhysicalScene({ storyboard, creativePlan: null, productName: "Коллаген" });
  assert.equal(validMontage.valid, true, JSON.stringify(validMontage));
  const invalidPickup = physical.validatePhysicalScene({
    storyboard: { ...storyboard, frames: [avatar, frame("герой держит Коллаген в одной руке", "Коллаген в одной руке", "on_camera")] },
    creativePlan: null, productName: "Коллаген",
  });
  assert.ok(invalidPickup.errors.includes("frame_2_product_broll_has_human_interaction"));
  assert.ok(invalidPickup.errors.includes("frame_2_product_teleports_between_frames"));

  const sourceBrief = {
    reference_subject_mode: "object_only", visible_subject_policy: "object_only", reference_format_mode: "voiceover_montage",
    camera_timeline: [{ start_sec: 0, end_sec: 6, speech_mode: "voiceover_only", setting: "кухня", lighting: "из окна", avatar_allowed: false }],
    atmosphere: { setting: "кухня", lighting: "из окна" }, clothing: { style: "рубашка" },
  };
  const sourceBefore = structuredClone(sourceBrief);
  const adaptedBrief = avatarReel.adaptDirectorBriefForAvatarReel(sourceBrief);
  assert.equal(adaptedBrief.referenceSceneMode, "presenter");
  assert.equal(adaptedBrief.reference_subject_mode, "presenter");
  assert.equal(adaptedBrief.visible_subject_policy, "presenter");
  assert.equal(sceneMode.resolveReferenceSceneMode(sourceBrief), "object_only");
  assert.equal(sceneMode.resolveReferenceSceneMode(adaptedBrief), "presenter");
  assert.deepEqual(adaptedBrief.camera_timeline, sourceBrief.camera_timeline);
  assert.deepEqual(adaptedBrief.atmosphere, sourceBrief.atmosphere);
  assert.deepEqual(adaptedBrief.clothing, sourceBrief.clothing);
  assert.equal(adaptedBrief.reference_format_mode, "voiceover_montage");
  assert.deepEqual(sourceBrief, sourceBefore);
  assert.equal(avatarReel.adaptDirectorBriefForAvatarReel(null), null);

  const allBroll = [{
    index: 1, durationSeconds: 6, voiceoverText: storyboard.voiceoverText,
    creativeStrategy: { referenceSceneMode: "object_only", setting: "кухня" },
    creativePlan: { productRole: "background_prop", productVisibleByFrame: [false, true, false] },
    storyboardPlan: { ...storyboard, frames: [
      { ...avatar, speechMode: "voiceover_only", visualAction: "неподвижный тематический предмет", referenceTransfer: {
        cameraComposition: "макро предмета", requiredReferenceAction: "руки рядом с предметом",
        requiredSupportProps: ["деревянная доска"], decisions: { presenterAction: "source_hands", sourceProduct: "remove" },
      } }, product, { ...avatar, speechMode: "voiceover_only", visualAction: "тематическая перебивка" },
    ] },
  }];
  const beforeAdaptation = structuredClone(allBroll);
  const avatarPlan = avatarReel.ensureTalkingAvatarInPromptPlan(allBroll, "Коллаген");
  assert.deepEqual(allBroll, beforeAdaptation, "avatar adaptation must not mutate saved source plans");
  const adaptedFrames = avatarPlan[0].storyboardPlan.frames;
  assert.deepEqual(adaptedFrames.map((frame) => frame.speechMode), ["on_camera", "voiceover_only", "voiceover_only"]);
  assert.deepEqual(adaptedFrames.map((frame) => frame.spokenText), allBroll[0].storyboardPlan.frames.map((frame) => frame.spokenText));
  assert.deepEqual(adaptedFrames.slice(1), allBroll[0].storyboardPlan.frames.slice(1), "product and other thematic B-roll must remain unchanged");
  assert.equal(adaptedFrames[0].environment, allBroll[0].storyboardPlan.frames[0].environment);
  assert.equal(adaptedFrames[0].wardrobe, allBroll[0].storyboardPlan.frames[0].wardrobe);
  assert.equal(adaptedFrames[0].physicalPlan.speechMode, "on_camera");
  assert.deepEqual(adaptedFrames[0].physicalPlan.visibleEntityIds, []);
  assert.match(adaptedFrames[0].camera, /деревянная доска/);
  assert.equal(adaptedFrames[0].referenceTransfer.cameraComposition, adaptedFrames[0].camera);
  assert.equal(adaptedFrames[0].referenceTransfer.requiredReferenceAction, adaptedFrames[0].visualAction);
  assert.deepEqual(avatarPlan[0].creativePlan.productVisibleByFrame, [false, true, false]);
  assert.equal(avatarPlan[0].durationSeconds, allBroll[0].durationSeconds);
  assert.equal(avatarPlan[0].voiceoverText, allBroll[0].voiceoverText);
  assert.equal(avatarPlan[0].creativeStrategy.referenceSceneMode, "presenter");
  assert.strictEqual(avatarReel.ensureTalkingAvatarInPromptPlan(avatarPlan, "Коллаген"), avatarPlan, "an existing talker needs no additional conversion");
  const onlyProducts = [{ ...allBroll[0], creativePlan: { productVisibleByFrame: [true] }, storyboardPlan: { ...storyboard, frames: [product] } }];
  assert.throws(() => avatarReel.ensureTalkingAvatarInPromptPlan(onlyProducts, "Коллаген"), /кадр без продукта/);
  const shortNameProduct = [{ ...onlyProducts[0], creativePlan: { productRole: "background_prop" },
    storyboardPlan: { ...storyboard, frames: [frame("K9 стоит на столе", "K9 на столе", "voiceover_only")] },
  }];
  assert.throws(() => avatarReel.ensureTalkingAvatarInPromptPlan(shortNameProduct, "K9"), /кадр без продукта/);
  const missingMask = [{ ...allBroll[0], creativePlan: { productRole: "background_prop" } }];
  assert.deepEqual(avatarReel.ensureTalkingAvatarInPromptPlan(missingMask, "Коллаген")[0].creativePlan.productVisibleByFrame, [false, true, false]);

  const pureBrollSource = {
    segmentIndex: 1, sceneMode: "presenter", durationSeconds: 6, beats: [{
      startSeconds: 0, endSeconds: 6, sourceStartSeconds: 0, sourceEndSeconds: 6,
      speechMode: "voiceover_only", avatarAllowed: false, sourceRole: "environment_broll", visibleSubjectRole: "no_people",
      camera: "макро неподвижных предметов", setting: "кухня", environment: "деревянный стол", lighting: "свет из окна",
    }],
  };
  assert.equal(referencePlan.allowsTalkingAvatarIntro(pureBrollSource, 0), true);
  assert.equal(referencePlan.allowsTalkingAvatarIntro(pureBrollSource, 1), false);
  assert.equal(referencePlan.allowsTalkingAvatarIntro({ ...pureBrollSource, sceneMode: "object_only" }, 0), false);
  assert.equal(referencePlan.allowsTalkingAvatarIntro({ ...pureBrollSource, beats: [{ ...pureBrollSource.beats[0], speechMode: "on_camera", avatarAllowed: true }] }, 0), false);
  const storedFrames = [
    { index: 1, role: "face_open", spokenWords: "Сначала выбираем состав спокойно", productState: "продукт вне кадра",
      action: "сохранённый аватар говорит в камеру", camera: "средний крупный план аватара", visualDescription: "говорящий аватар", referenceRole: "avatar", sfx: null },
    { index: 2, role: "product_cutaway", spokenWords: "Потом рассматриваем нашу упаковку", productState: "Коллаген стоит на столе",
      action: "упаковка неподвижна", camera: "макро продукта", visualDescription: "Коллаген на столе без людей", referenceRole: "product", sfx: null },
    { index: 3, role: "environment_cutaway", spokenWords: "Дальше изучаем детали состава", productState: "продукт вне кадра",
      action: "свет на поверхности", camera: "макро фактуры", visualDescription: "тематическая предметная перебивка", referenceRole: "environment", sfx: null },
  ];
  const applied = referencePlan.applyReferenceSegmentPlanToFrames(pureBrollSource, storedFrames, true, { productVisibleByFrame: [false, true, false] });
  assert.deepEqual(applied.map((frame) => frame.role), ["face_open", "product_cutaway", "environment_cutaway"]);
  assert.deepEqual(applied.map((frame) => frame.spokenWords), storedFrames.map((frame) => frame.spokenWords));
  assert.equal(applied[0].camera, storedFrames[0].camera, "the approved avatar intro must not regain the source object-only camera");
  const sourceIssues = (frame, frameIndex, productVisible = false) => sourceValidator.validateStoryboardFrameSourceInterval({
    frame, frameIndex, frameCount: 3, path: `frames.${frameIndex}`, plan: pureBrollSource, productName: "Коллаген", productVisible,
  });
  assert.deepEqual(sourceIssues(applied[0], 0), []);
  assert.deepEqual(sourceIssues(applied[1], 1, true), []);
  assert.deepEqual(sourceIssues(applied[2], 2), []);
  assert.ok(sourceIssues(storedFrames[0], 2).some((issue) => issue.code === "storyboard_source_avatar_forbidden_face"), "the intro exception must not authorize later presenter frames");
  assert.ok(sourceIssues({ ...storedFrames[0], productState: "Коллаген на столе" }, 0, true).length > 0);
  assert.ok(sourceIssues(storedFrames[0], 0, true).length > 0, "an explicitly product-visible frame cannot use the avatar exception even if its text says hidden");
  const restored = referencePlan.applyReferenceSegmentPlanToStoryboard(pureBrollSource, avatarPlan[0].storyboardPlan, true, { productVisibleByFrame: [false, true, false] });
  assert.deepEqual(restored.frames.map((frame) => frame.speechMode), ["on_camera", "voiceover_only", "voiceover_only"]);
  assert.deepEqual(restored.frames.map((frame) => frame.spokenText), avatarPlan[0].storyboardPlan.frames.map((frame) => frame.spokenText));
  assert.equal(restored.frames[0].camera, avatarPlan[0].storyboardPlan.frames[0].camera);
  assert.deepEqual(restored.frames[1].productPlacement, avatarPlan[0].storyboardPlan.frames[1].productPlacement);

  process.env.OPENROUTER_API_KEY = "test-key";
  const requests = [];
  global.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init.body)));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
      status: "pass", confidence: 0.95, panels: [], violations: [], repair_instructions: [],
    }) } }] }) };
  };
  for (const referenceSceneMode of ["presenter", "voiceover_broll", "faceless_hands", "object_only"]) {
    await single.validateStoryboardImage({
      imageUrl: "https://example.com/storyboard.jpg", avatarReferenceUrl: "https://example.com/avatar.jpg",
      productName: "Коллаген", storyboard, referenceSceneMode,
    });
    const request = requests.at(-1);
    assert.match(request.messages[0].content, /PRODUCT_SUPPORT_MISSING/);
    assert.match(request.messages[0].content, /PRODUCT_BROLL_HAS_HUMAN_INTERACTION/);
    assert.match(request.messages[0].content, /Static panels cannot prove temporal physics/);
    assert.doesNotMatch(request.messages[0].content, /The only allowed error codes/);
    const text = request.messages[1].content[0].text;
    assert.match(text, /product_placement/);
    assert.match(text, /physical_plan/);
    assert.match(text, /visual_action/);
  }
  await set.validateStoryboardSet({
    productName: "Коллаген", referenceFormatMode: "voiceover_montage",
    storyboards: [1, 2].map((segmentIndex) => ({
      segmentIndex, imageUrl: `https://example.com/${segmentIndex}.jpg`, storyboard: { ...storyboard, segmentIndex },
    })),
  });
  const setPrompt = requests.at(-1).messages[0].content[0].text;
  assert.match(setPrompt, /PRODUCT_SUPPORT_MISSING/);
  assert.match(setPrompt, /PRODUCT_BROLL_HAS_HUMAN_INTERACTION/);
  assert.match(setPrompt, /Do not compare apparent pixel size across camera angles/);
  assert.match(setPrompt, /visual_action/);
  assert.doesNotMatch(setPrompt, /The only allowed error codes/);
  assert.equal(requests.length, 5, "each validation reuses its existing single request; all fetch calls are mocked");
  console.log("Storyboard physics preflight checks passed (local, all provider calls mocked)");
} finally {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  rmSync(output, { recursive: true, force: true });
}

function frame(visualAction, productPlacement, speechMode, camera = "средний план") {
  return { spokenText: "Состав помогает выбрать вариант", visualAction, productPlacement, speechMode, camera,
    environment: "комната", wardrobe: "рубашка", sfxNotes: "", effectNotes: "" };
}
