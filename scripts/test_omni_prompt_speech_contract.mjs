import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-prompt-speech-"));
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
      join(ui, "src/lib/server/omni/**/*.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const contractOutput = findFile(compiled, "creative-contract.js");
  const aliasContract = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(aliasContract), { recursive: true });
  copyFileSync(contractOutput, aliasContract);
  for (const fileName of ["omni-storyboard-timing.js", "omni-storyboard-types.js", "omni-storyboard-contract.js"]) {
    const source = findFile(compiled, fileName);
    const target = join(output, "node_modules", "@", "lib", "omni", "storyboard", fileName);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }

  const { buildOmniSegmentPrompts } = require(findFile(compiled, "omni-prompt-builder.js"));
  const { validatePromptVoiceoverIsolation } = require(findFile(compiled, "omni-prompt-validator.js"));
  const prompts = buildOmniSegmentPrompts(buildInput());

  assert.deepEqual(validatePromptVoiceoverIsolation(prompts), []);
  for (const item of prompts) {
    assert.equal(normalizedCount(item.prompt, item.voiceoverText), 1);
    assert.ok(!/СЦЕНАРНЫЕ БИТЫ ЭТОЙ ЧАСТИ:[\s\S]*?\bречь\s*-/iu.test(item.prompt));
    assert.ok(item.prompt.includes("Реплика персонажа:"), "storyboard prompt must provide exact character speech once");
    assert.ok(!item.prompt.includes("Озвучка:"), "storyboard prompt must not imply background voiceover");
    assert.ok(item.prompt.includes("раскадровку только как скрытый референс"), "storyboard prompt must lean on storyboard reference");
    assert.ok(item.prompt.includes("@storyboard_file"), "storyboard prompt must keep file placeholder until KIE upload order is known");
    assert.ok(item.prompt.includes("обычное вертикальное 9:16 видео"), "storyboard prompt must render a normal vertical video");
    assert.ok(item.prompt.includes("не показывай саму раскадровку"), "storyboard prompt must not render storyboard panels");
    assert.ok(item.prompt.includes("повтори в точности количество сцен"), "storyboard prompt must ask to copy storyboard exactly");
    assert.ok(item.prompt.includes("сам произносит реплику на русском языке"), "storyboard prompt must force Russian character speech");
    assert.ok(item.prompt.includes("не используй закадровый голос"), "storyboard prompt must forbid background narration");
    assert.ok(item.prompt.includes("без длинных пауз"), "storyboard prompt must forbid sparse pacing");
    assert.ok(item.prompt.includes("включая последнюю фразу и призыв"), "storyboard prompt must require final CTA");
    assert.ok(item.prompt.includes("без повторов, переводов и добавлений"), "storyboard prompt must forbid duplicated speech");
    assert.ok(!/речь:\s*"/iu.test(item.prompt), "storyboard frame lines must not repeat spoken chunks");
    assert.ok(item.prompt.includes("не добавляй музыку"), "storyboard prompt must forbid Omni music");
    assert.ok(!item.prompt.includes("субтитры примени как с референса"), "storyboard prompt must not ask to copy subtitles");
    assert.ok(item.prompt.length < 1600, "storyboard prompt must stay short");
    assert.equal(item.storyboardPlan.frames.length, item.durationSeconds / 2, "storyboard frame count must follow duration");
    assert.ok(!item.prompt.includes("ТОЧНАЯ РЕПЛИКА"), "legacy quoted speech marker must not be used");
    assert.ok(!item.prompt.includes(`"${item.voiceoverText}"`), "spoken text must not be wrapped in quotes");
  }
  assert.equal(normalizedCount(prompts[0].prompt, prompts[1].voiceoverText), 0);
  assert.equal(normalizedCount(prompts[1].prompt, prompts[0].voiceoverText), 0);
  assert.equal(normalizedCount(prompts[1].prompt, prompts[2].voiceoverText), 0);

  const storedInput = buildStoredPromptInput();
  const storedPrompts = buildOmniSegmentPrompts(storedInput);
  const storedSegments = storedInput.generatedScript.source_snapshot.llm_prompt_chain.providerPromptPlan.segmentPrompts;
  assert.equal(storedPrompts.length, storedSegments.length);
	  storedPrompts.forEach((item, index) => {
	    assert.notEqual(item.prompt, storedSegments[index].prompt);
	    assert.ok(item.prompt.includes("раскадровку только как скрытый референс"));
	    assert.equal(item.voiceoverText, storedSegments[index].voiceover);
	    assert.equal(item.storyboardPlan.frames.length, item.durationSeconds / 2);
    assert.ok(!item.prompt.includes("PRODUCT ACTION:"), "stored LLM prompt path must not inject product action blocks");
    assert.ok(!item.prompt.includes("SCENE ACTION:"), "stored LLM prompt path must not inject scene action blocks");
	    assert.ok(!item.prompt.includes("CONTINUITY:"), "stored LLM prompt path must not inject continuity blocks");
	  });

	  const legacyStoredInput = buildStoredPromptInput({ omitStoryboardFrames: true });
	  assert.throws(
	    () => buildOmniSegmentPrompts(legacyStoredInput),
	    /storyboard|frames|Раскадров/iu,
	    "stored LLM prompt path must reject snapshots without storyboard frames"
	  );

	  console.log("Omni prompt speech contract regression checks passed");
	} finally {
  rmSync(output, { recursive: true, force: true });
}

function buildInput() {
  const voiceSegments = [
    "Аэрогриль помогает готовить ужин быстрее когда хочется хрустящей корочки без лишнего масла и долгой уборки.",
    "Я ставлю его на стол показываю чашу и спокойно объясняю почему дома это экономит силы.",
    "Если нужен такой помощник артикул аэрогриля можно найти в описании и сравнить перед покупкой самостоятельно.",
  ];
  return {
    generatedScript: {
      id: 71,
      project_id: 7,
      product_id: 10,
      script: voiceSegments.join(" "),
      source_snapshot: {
        generated_script_plan: {
          hook_options: ["Аэрогриль без лишнего масла"],
          selected_hook: "Аэрогриль без лишнего масла",
          beats: [
            {
              stage: "hook",
              visual_cue: "Герой на кухне показывает реальный аэрогриль на столе.",
              voiceover: voiceSegments[0],
            },
            {
              stage: "body",
              visual_cue: "Рука слегка поворачивает продукт, видна контактная тень на кухонной поверхности.",
              voiceover: voiceSegments[1],
            },
            {
              stage: "cta",
              visual_cue: "Возврат к лицу на той же кухне, фон не меняется.",
              voiceover: voiceSegments[2],
            },
          ],
        },
      },
    },
    legacyTranscript: null,
    product: {
      id: 10,
      project_id: 7,
      name: "Аэрогриль",
      description: "Кухонный аэрогриль для приготовления блюд без лишнего жира",
      product_reference_notes: "Черный настольный аэрогриль на кухонной поверхности.",
      product_refs: [{
        id: "air-fryer",
        url: "https://example.com/air-fryer.png",
        kind: "image",
        role: "product_primary",
        is_primary: true,
      }],
      avatar_refs: [],
      cta_mode: "article_in_description",
      cta_value: null,
    },
    avatar: {
      id: 3,
      project_id: 7,
      display_name: "Елисей",
      prompt: "Мужчина в домашнем кухонном образе.",
      reference_url: "https://example.com/avatar.png",
      status: "approved",
      provider: "kie-omni",
      kie_character_id: "char_air",
      kie_character_status: "completed",
      kie_character_payload: null,
      is_active: true,
      created_at: "2026-07-22T00:00:00.000Z",
      updated_at: "2026-07-22T00:00:00.000Z",
    },
    segmentCount: 3,
    segmentSeconds: 10,
    voiceSegments: voiceSegments.map((text, index) => ({
      index: index + 1,
      text,
      wordCount: text.split(/\s+/u).filter(Boolean).length,
    })),
    segmentDurationsSeconds: [6, 6, 6],
    brief: null,
    targetAudience: "люди, которые готовят дома",
    ctaMode: "article_in_description",
    ctaValue: null,
    recentFormatIds: [],
  };
}

function buildStoredPromptInput(options = {}) {
  const input = buildInput();
  const voiceSegments = input.voiceSegments.map((segment) => segment.text);
  input.generatedScript.source_snapshot.llm_prompt_chain = {
    providerPromptPlan: {
      version: "llm-prompt-chain-v1",
      format: "talking_head_cutaways",
	      segmentPrompts: voiceSegments.map((voiceover, index) => ({
	        index: index + 1,
	        durationSeconds: 6,
	        voiceover,
	        storyboardFrames: options.omitStoryboardFrames ? [] : makeStoredStoryboardFrames(voiceover),
	        referenceRole: "avatar",
	        prompt: [
	          "Вертикальное живое видео на кухне.",
	          "Миша начинает с лица в камеру и говорит энергично.",
	          "В середине короткая перебивка на аэрогриль на столе без рук.",
	          "Затем возврат к лицу в той же кухне.",
	          "Свою музыку не добавляй.",
	          `Речь звучит точно: ${voiceover}`,
	        ].join(" "),
	      })),
      notes: "Готовые промпты написаны LLM.",
    },
  };
  return input;
}

function makeStoredStoryboardFrames(voiceover) {
  const words = voiceover.split(/\s+/u).filter(Boolean);
  return [0, 1, 2].map((index) => ({
    index: index + 1,
    role: index === 0 ? "face_open" : index === 2 ? "face_return" : "product_cutaway",
    spokenWords: words.slice(index * 5, index * 5 + 5).join(" "),
    visualDescription: "живая кухня с тем же человеком и продуктом",
    camera: index === 2 ? "крупный план продукта" : "фронтальный план на телефон",
    action: "персонаж продолжает мысль и показывает продукт",
    productState: "аэрогриль стоит на столе без рук",
    sfx: "тихие естественные звуки кухни",
    referenceRole: index === 0 || index === 4 ? "avatar" : "product",
  }));
}

function normalizedCount(haystack, needle) {
  const normalizedHaystack = normalize(haystack);
  const normalizedNeedle = normalize(needle);
  return normalizedNeedle ? normalizedHaystack.split(normalizedNeedle).length - 1 : 0;
}

function normalize(value) {
  return String(value).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
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
