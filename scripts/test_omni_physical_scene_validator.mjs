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
const require = createRequire(import.meta.url);

try {
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
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/physical-scene-validator.ts"),
      join(ui, "src/lib/server/omni/physical-storyboard-normalizer.ts"),
      join(ui, "src/lib/server/omni/storyboard/omni-stored-storyboard-frame-repair.ts"),
      join(ui, "src/lib/server/omni/storyboard/omni-storyboard-speech.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const validator = require(findFile(compiled, "physical-scene-validator.js"));
  const physicalModel = require(findFile(compiled, "physical-scene-model.js"));
  const normalizer = require(findFile(compiled, "physical-storyboard-normalizer.js"));
  const speech = require(findFile(compiled, "omni-storyboard-speech.js"));
  const storedFrameRepair = require(findFile(compiled, "omni-stored-storyboard-frame-repair.js"));

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
  assert.equal(repairedStoredValidation.valid, true);

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
    productVisible: true,
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
    storyboard: storyboard([
      frame(
        "Рассказываю о составе продукта",
        "обе руки у лица, герой кусает морковь и ведет машину",
        "держит сыр и Коллаген в руках",
        "средний план в движущейся машине"
      ),
    ]),
  });
  assert.equal(
    validator.validatePhysicalScene({
      storyboard: normalizedConflict,
      creativePlan: null,
      productName: "Коллаген",
    }).valid,
    true
  );
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
  assert.match(staleProduct.frames[1].productPlacement, /продукт вне кадра/iu);
  assert.doesNotMatch(staleProduct.frames[1].visualAction, /держит Коллаген/iu);

  const normalizedCheekAction = normalizer.normalizePhysicalStoryboardSegment({
    productName: "Коллаген",
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
