import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-scriptwriter-"));
const dist = join(output, "dist");
const require = createRequire(import.meta.url);

try {
  writeFileSync(
    join(output, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        skipLibCheck: true,
        strict: true,
        esModuleInterop: true,
        module: "commonjs",
        moduleResolution: "node",
        resolveJsonModule: true,
        isolatedModules: false,
        incremental: false,
        outDir: "dist",
        baseUrl: ui,
        paths: { "@/*": ["src/*"] },
      },
      include: [
        join(ui, "src/lib/server/omni/omni-scriptwriter-frames.ts"),
        join(ui, "src/lib/server/omni/omni-topic-proposer.ts"),
        join(ui, "src/lib/server/omni/omni-scriptwriter.ts"),
        join(ui, "src/lib/server/omni/omni-script-director.ts"),
      ],
    })
  );
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["-p", join(output, "tsconfig.json")], {
    cwd: ui,
    stdio: "inherit",
  });

  const dbStubPath = join(output, "db-stub.js");
  writeFileSync(
    dbStubPath,
    'module.exports = { query: async () => { throw new Error("DB forbidden in scriptwriter test"); }, connect: async () => { throw new Error("DB forbidden in scriptwriter test"); } };'
  );
  const nodeModule = require("node:module");
  const originalResolveFilename = nodeModule._resolveFilename;
  nodeModule._resolveFilename = function (request, ...args) {
    if (request === "@/lib/db") return dbStubPath;
    return originalResolveFilename.call(this, request, ...args);
  };
  let framesModule, proposerModule, scriptwriterModule, directorModule;
  try {
    framesModule = require(findFile(dist, "omni-scriptwriter-frames.js"));
    proposerModule = require(findFile(dist, "omni-topic-proposer.js"));
    scriptwriterModule = require(findFile(dist, "omni-scriptwriter.js"));
    directorModule = require(findFile(dist, "omni-script-director.js"));
  } finally {
    nodeModule._resolveFilename = originalResolveFilename;
  }

  // ---- frames ----
  const { collectScriptwriterFrames, findScriptwriterFrame, pickDefaultScriptwriterFrame, BUILTIN_SCRIPTWRITER_FRAMES } = framesModule;
  assert.ok(BUILTIN_SCRIPTWRITER_FRAMES.length >= 6, "builtin frame catalog present");
  const materialStructure = ["Крючок", "Интрига", "Демонстрация", "Вывод", "Призыв"];
  const frames = collectScriptwriterFrames([{ narrative_structure: materialStructure, hook_mechanism: "обманутое ожидание" }]);
  assert.equal(frames.length, BUILTIN_SCRIPTWRITER_FRAMES.length + 1, "unique reference structure adds a frame");
  const duplicateFrames = collectScriptwriterFrames([{ narrative_structure: BUILTIN_SCRIPTWRITER_FRAMES[0].structure.slice(), hook_mechanism: null }]);
  assert.equal(duplicateFrames.length, BUILTIN_SCRIPTWRITER_FRAMES.length, "duplicate structure is not added twice");
  assert.ok(findScriptwriterFrame(frames, "reference-1"));
  assert.ok(findScriptwriterFrame(frames, "nope") === null);
  assert.equal(pickDefaultScriptwriterFrame(frames, ["hook-problem-solution"]).id !== "hook-problem-solution", true, "picker avoids used frame");

  // ---- topic proposer ----
  const { proposeScriptwriterTopics, isConceptCoveredByScripts } = proposerModule;
  const materials = [
    { material_id: 1, topic: "тема из снапшота старого анализа", core_concept: "быстрый утренний уход без лишних шагов", hook_mechanism: "вопрос в первую секунду", visual_hook_action: null, format_mode: "voiceover_montage", product_position: "body", narrative_structure: materialStructure },
    { material_id: 2, topic: null, core_concept: "ошибки в выборе крема для зимы", hook_mechanism: null, visual_hook_action: "резкий зум на флакон", format_mode: "continuous_story", product_position: "never", narrative_structure: BUILTIN_SCRIPTWRITER_FRAMES[2].structure.slice() },
    { material_id: 3, topic: "старый анализ без content_meaning", core_concept: null, hook_mechanism: null, visual_hook_action: "продукт появляется внезапно", format_mode: null, product_position: null, narrative_structure: [] },
  ];
  const proposals = proposeScriptwriterTopics(materials, [], 5);
  assert.equal(proposals.length, 3, "snapshot-topic fallback keeps old analyses usable");
  assert.equal(proposals[0].source_material_id, 1, "product-bearing material ranks first");
  assert.ok(proposals[0].rationale.includes("ещё не раскрыта"), "uncovered rationale");
  const legacy = proposals.find((p) => p.source_material_id === 3);
  assert.equal(legacy.topic, "старый анализ без content_meaning", "topic falls back to snapshot");
  assert.ok(legacy.rationale.includes("продукт появляется внезапно"), "hook falls back to visual action");
  const covered = proposeScriptwriterTopics(materials, [{ script: "утренний уход теперь быстрый и без лишних шагов вообще", title: null, hook: null }], 5);
  assert.equal(covered[0].source_material_id, 2, "covered concept sinks below uncovered");
  assert.equal(isConceptCoveredByScripts("быстрый утренний уход", [{ script: "мой утренний уход стал быстрым" }]), true);

  // ---- scriptwriter compose ----
  const { computeScriptwriterWordBudget, buildScriptwriterPrompt, composeScriptwriterDraft, ScriptwriterFailure } = scriptwriterModule;
  assert.equal(computeScriptwriterWordBudget(20), 44);
  assert.equal(computeScriptwriterWordBudget(0), 44, "invalid duration falls back to 20s");

  const card = {
    name: "Крем «Аура»",
    description: "Лёгкий дневной крем для холодного сезона",
    product_reference_notes: "не жирнит, быстро впитывается",
    visual_summary: "белый флакон сорок миллилитров, матовая крышка",
    physical_contract: null,
    target_duration_seconds: 20,
    cta_mode: "keyword_in_comments",
    cta_value: "уход",
  };
  const prompt = buildScriptwriterPrompt({
    topic: "быстрый утренний уход",
    frame: frames[0],
    product: card,
    materials: [{ material_id: 1, format_mode: "voiceover_montage", hook_mechanism: "вопрос в первую секунду", visual_hook_action: "крупный план рук", retention_trigger: "интрига", narrative_structure: materialStructure, reusable_visual_mechanics: ["продукт в руке"] }],
    wordBudget: 44,
  });
  assert.ok(prompt.includes("Крем «Аура»"), "product card in prompt");
  assert.ok(prompt.includes("быстрый утренний уход"), "topic in prompt");
  assert.ok(prompt.includes("вопрос в первую секунду"), "material hook in prompt");
  assert.ok(prompt.includes("ПРИМЕРЫ ФОРМЫ ИЗ РЕФЕРЕНСОВ"), "form-only framing section");
  assert.ok(prompt.includes("keyword_in_comments"), "cta mode in prompt");
  assert.ok(!prompt.includes("position"), "no product-position leakage from references");

  const validDraftJson = JSON.stringify({
    hook: "Почему крем сушит кожу зимой?",
    script: "Почему крем сушит кожу зимой? Потому что он не умеет держать влагу. Аура делает это за него: лёгкая текстура, быстрое впитывание, кожа дышит весь день. Хочешь такой же результат — напиши слово уход в комментариях, расскажу подробнее.",
    cta_keyword: "уход",
  });
  const tooShortDraftJson = JSON.stringify({ hook: "x", script: "слишком коротко", cta_keyword: null });

  let attempts = [];
  const composed = await composeScriptwriterDraft({
    topic: "быстрый утренний уход",
    frame: frames[0],
    product: card,
    materials: [],
    request: async ({ attempt }) => {
      attempts.push(attempt);
      return attempt === 1 ? tooShortDraftJson : validDraftJson;
    },
  });
  assert.deepEqual(attempts, [1, 2], "retry happens after invalid draft");
  assert.ok(composed.script.length > 40);
  assert.ok(composed.script.includes("уход"), "cta keyword stays in script");
  assert.equal(composed.wordBudget, 44);

  await assert.rejects(
    () => composeScriptwriterDraft({
      topic: "t", frame: frames[0], product: card, materials: [],
      request: async () => tooShortDraftJson,
    }),
    (error) => error instanceof ScriptwriterFailure,
    "both attempts failing throws ScriptwriterFailure"
  );

  // ---- director plan ----
  const { normalizeScriptDirectorPlan, buildScriptDirectorPrompt, composeScriptDirectorPlan, ScriptDirectorPlanInvalid } = directorModule;
  const validPlan = JSON.stringify({
    scenes: [
      { scene_index: 1, start_sec: 0, end_sec: 6, purpose: "крючок", visual_description: "крупный план лица, утренний свет из окна", product_visible: false, product_action: null, speech_excerpt: "Почему крем сушит кожу зимой?" },
      { scene_index: 2, start_sec: 6, end_sec: 14, purpose: "решение", visual_description: "рука выдавливает крем на ладонь, крупный план текстуры", product_visible: true, product_action: "крем в руке", speech_excerpt: "Аура делает это за него" },
      { scene_index: 3, start_sec: 14, end_sec: 20, purpose: "призыв", visual_description: "средний план, лёгкая улыбка в камеру", product_visible: true, product_action: "флакон на полке", speech_excerpt: "напиши слово уход" },
    ],
    atmosphere: "мягкий утренний",
    camera_notes: "статичные кадры, ручная камера на демонстрации",
  });
  const plan = normalizeScriptDirectorPlan(validPlan, 20);
  assert.equal(plan.scenes.length, 3);
  assert.equal(plan.scenes[1].product_action, "крем в руке");
  assert.equal(plan.atmosphere, "мягкий утренний");

  const gapPlan = JSON.parse(validPlan);
  gapPlan.scenes[1].start_sec = 8;
  assert.throws(() => normalizeScriptDirectorPlan(JSON.stringify(gapPlan), 20), ScriptDirectorPlanInvalid, "gap rejected");

  const noProductPlan = JSON.parse(validPlan);
  noProductPlan.scenes.forEach((scene) => { scene.product_visible = false; });
  assert.throws(() => normalizeScriptDirectorPlan(JSON.stringify(noProductPlan), 20), ScriptDirectorPlanInvalid, "invisible product rejected");

  const shortCover = JSON.parse(validPlan);
  shortCover.scenes = shortCover.scenes.slice(0, 1);
  assert.throws(() => normalizeScriptDirectorPlan(JSON.stringify(shortCover), 20), ScriptDirectorPlanInvalid, "coverage miss rejected");

  const directorPrompt = buildScriptDirectorPrompt({
    script: "текст сценария для проверки промпта режиссёра",
    productSummary: "Крем «Аура» — лёгкий дневной крем",
    targetDurationSeconds: 20,
    materials: [{ material_id: 1, format_mode: null, hook_mechanism: null, visual_hook_action: "крупный план рук", retention_trigger: null, narrative_structure: [], reusable_visual_mechanics: ["продукт в руке"] }],
  });
  assert.ok(directorPrompt.includes("раскадровка"), "director role framing");
  assert.ok(directorPrompt.includes("продукт в руке"), "visual mechanics from materials");
  assert.ok(directorPrompt.includes("не меняй текст"), "script is frozen for the director");

  const composedPlan = await composeScriptDirectorPlan({
    script: "сценарий",
    productSummary: "Крем",
    targetDurationSeconds: 20,
    materials: [],
    request: async () => validPlan,
  });
  assert.equal(composedPlan.scenes.length, 3);

  console.log("Omni scriptwriter and director role checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: false })) {
    if (typeof entry === "string" && entry.endsWith(name)) {
      return join(dir, entry);
    }
  }
  throw new Error(`compiled file not found: ${name}`);
}
