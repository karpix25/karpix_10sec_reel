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

  const { buildOmniSegmentPrompts } = require(findFile(compiled, "omni-prompt-builder.js"));
  const { validatePromptVoiceoverIsolation } = require(findFile(compiled, "omni-prompt-validator.js"));
  const prompts = buildOmniSegmentPrompts(buildInput());

  assert.deepEqual(validatePromptVoiceoverIsolation(prompts), []);
  for (const item of prompts) {
    assert.equal(normalizedCount(item.prompt, item.voiceoverText), 1);
    assert.ok(!/СЦЕНАРНЫЕ БИТЫ ЭТОЙ ЧАСТИ:[\s\S]*?\bречь\s*-/iu.test(item.prompt));
    assert.ok(
      item.prompt.includes("полную точную реплику текущей части") ||
        item.prompt.includes("complete exact quote for this segment")
    );
  }
  assert.equal(normalizedCount(prompts[0].prompt, prompts[1].voiceoverText), 0);
  assert.equal(normalizedCount(prompts[1].prompt, prompts[0].voiceoverText), 0);
  assert.equal(normalizedCount(prompts[1].prompt, prompts[2].voiceoverText), 0);

  console.log("Omni prompt speech contract regression checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function buildInput() {
  const voiceSegments = [
    "Аэрогриль позволяет готовить ваши любимые блюда хрустящими,",
    "но без капли лишнего жира.",
    "Артикул аэрогриля можно найти в описании.",
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
    brief: null,
    targetAudience: "люди, которые готовят дома",
    ctaMode: "article_in_description",
    ctaValue: null,
    recentFormatIds: [],
  };
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
