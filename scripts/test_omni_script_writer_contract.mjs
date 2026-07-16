import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-script-writer-"));
const compiled = join(output, "compiled");
const tsconfig = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(tsconfig, JSON.stringify({
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
      join(ui, "src/lib/server/omni/director-analysis-types.ts"),
      join(ui, "src/lib/server/omni/director-analysis-prompt.ts"),
      join(ui, "src/lib/server/omni/script-prompt-helper.ts"),
      join(ui, "src/lib/server/omni/script-beat-plan.ts"),
      join(ui, "src/lib/server/omni/omni-script-text-contract.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const contractOutput = findFile(compiled, "creative-contract.js");
  const aliasContract = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(aliasContract), { recursive: true });
  copyFileSync(contractOutput, aliasContract);

  const { buildPrompt } = require(findFile(compiled, "script-prompt-helper.js"));
  const { normalizeGeneratedScriptPlan, deriveVoiceoverScriptFromPlan, selectScriptBeatsForSegment } =
    require(findFile(compiled, "script-beat-plan.js"));

  const prompt = buildPrompt({
    projectName: "Omni Reels",
    targetAudience: "женщины, уход за собой",
    brandVoice: "живой бытовой",
    productName: "Апельсиновый коллаген",
    productDescription: "Коллаген в желе для кожи, волос и ногтей",
    productReferenceNotes: "оранжевая упаковка",
    ctaMode: "article_in_description",
    ctaValue: null,
    sourceScenario: {
      id: 2924,
      script: "Хочешь сияющую кожу и крепкие ногти? Тогда тебе нужен коллаген!",
    },
    directorBrief: {
      visual_hook: { action: "Presenter talks to camera", retention_trigger: "Blue-lit direct address" },
      atmosphere: {
        mood: "Confident",
        lighting: "Cool blue background glow",
        color_grading: "Blue contrast",
        setting: "Blue-lit home background",
      },
      clothing: {
        style: "Black sleeveless fitted top",
        color_palette: ["black"],
        fit_details: "Clean fitted silhouette",
      },
      camera: {
        shot_types: ["Medium shot"],
        angles: ["Eye-level"],
        movements: ["Static"],
        stabilization: "Tripod",
      },
      montage_rhythm: {
        cut_pace: "Continuous talking head",
        beat_sync: "Cuts follow speech",
        transition_style: ["Hard cut"],
      },
      action_beats: [{ timestamp_sec: 0, action_description: "Looks into camera", actor_gesture: "Open palms" }],
      reusable_mechanics: {
        visual_mechanics: ["Direct-to-camera talking head"],
        safe_zones_for_elements: "",
        looping_pattern: "Return to same setup",
      },
    },
    durationRange: {
      requestedMinSeconds: 30,
      requestedMaxSeconds: 30,
      minSeconds: 30,
      maxSeconds: 30,
      minWords: 60,
      maxWords: 72,
      source: "client_settings",
      wasClamped: false,
    },
  });

  assert.ok(prompt.includes('"hook_options"'), "prompt must request three hook options");
  assert.ok(prompt.includes('"selected_hook"'), "prompt must request selected hook");
  assert.ok(prompt.includes('"beats"'), "prompt must request structured beats");
  assert.ok(prompt.includes('"visual_cue"'), "prompt must request visual cue per beat");
  assert.ok(prompt.includes('"voiceover"'), "prompt must request voiceover per beat");
  assert.ok(prompt.includes("копировать одежду главного персонажа"), "prompt must bind writer to reference wardrobe");
  assert.ok(prompt.includes("задний фон"), "prompt must bind writer to reference background");
  assert.ok(prompt.includes("Не пиши псевдовопросы"), "prompt must ban pseudo questions");
  assert.ok(prompt.includes("Не добавляй субтитры"), "prompt must ban provider subtitles");
  assert.ok(prompt.includes("Поле script должно совпадать"), "script must match beat voiceovers");
  assert.ok(prompt.includes("Целевая длительность итогового ролика: 30-30 сек"), "prompt must include configured duration range");
  assert.ok(prompt.includes("60-72 слов"), "prompt must include computed word range");

  const plan = normalizeGeneratedScriptPlan({
    hook_options: ["Хук 1", "Хук 2", "Хук 3"],
    selected_hook: "Хук 2",
    beats: [
      { stage: "hook", visual_cue: "черный топ, синий фон", voiceover: "Хочешь проще ухаживать за кожей?" },
      { stage: "body", visual_cue: "продукт в синем свете", voiceover: "Коллаген легко встроить в утро." },
      { stage: "cta", visual_cue: "возврат к лицу", voiceover: "Артикул можно найти в описании." },
    ],
  });
  assert.equal(deriveVoiceoverScriptFromPlan(plan), "Хочешь проще ухаживать за кожей? Коллаген легко встроить в утро. Артикул можно найти в описании.");
  assert.equal(selectScriptBeatsForSegment(plan, 1, 2).length, 1);
  assert.equal(selectScriptBeatsForSegment(plan, 2, 2).length, 2);

  console.log("Omni script writer contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function findFile(dir, fileName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      try {
        return findFile(path, fileName);
      } catch {
        continue;
      }
    }
    if (entry.name === fileName) return path;
  }
  throw new Error(`Could not find ${fileName} in ${dir}`);
}
