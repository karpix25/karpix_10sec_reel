import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-positive-prompt-"));
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
  const baseInput = {
    generatedScript: {
      id: 1,
      project_id: 1,
      product_id: 1,
      script: "Коллаген стал моей спокойной утренней привычкой. Я не люблю сложный уход, поэтому выбираю то, что легко встроить в день. Артикул можно найти в описании.",
    },
    legacyTranscript: null,
    product: {
      id: 1,
      project_id: 1,
      name: "Коллаген",
      description: "Добавка для красоты кожи и волос",
      product_reference_notes: null,
      avatar_reference_notes: "Героиня в мягком бежевом свитере и светлых джинсах, без логотипов.",
      product_refs: [{
        id: "product-1",
        url: "https://example.com/product.png",
        kind: "image",
        role: "product_primary",
        is_primary: true,
      }],
      avatar_refs: [],
      cta_mode: "article_in_description",
      cta_value: null,
    },
    avatar: {
      id: 1,
      project_id: 1,
      display_name: "Анна",
      prompt: "Доброжелательная женщина 30 лет, домашний живой образ.",
      reference_url: "https://example.com/avatar.png",
      status: "approved",
      provider: "kie-omni",
      kie_character_id: "char_123",
      kie_character_status: "completed",
      kie_character_payload: null,
      is_active: true,
      created_at: "2026-07-13T00:00:00.000Z",
      updated_at: "2026-07-13T00:00:00.000Z",
    },
    segmentCount: 3,
    segmentSeconds: 10,
    brief: null,
    targetAudience: "женщины, уход за собой",
    ctaMode: "article_in_description",
    ctaValue: null,
    recentFormatIds: [],
  };

  delete process.env.OMNI_PROVIDER_PROMPT_STYLE;
  const prompts = buildOmniSegmentPrompts(baseInput);

  const joinedPrompt = prompts.map((item) => item.prompt).join("\n");
  assert.ok(prompts.every((item) => item.creativeStrategy.lifeFormatId === "talking_head_cutaways"));
  assert.equal(prompts[0].referenceUrl, "https://example.com/avatar.png");
  assert.equal(prompts[1].referenceUrl, "https://example.com/product.png");
  assert.equal(prompts[2].referenceUrl, "https://example.com/product.png");
  assert.ok(joinedPrompt.includes("ВИЗУАЛЬНЫЙ СТИЛЬ СЦЕНАРИСТА:"), "positive visual style must be rendered");
  assert.ok(joinedPrompt.includes("КАМЕРА И СВЕТ:"), "camera and light must be rendered");
  assert.ok(joinedPrompt.includes("чистое сырое видео напрямую с сенсора камеры"), "clean-frame provider contract must be rendered");
  assert.ok(joinedPrompt.includes("ГОВОРЯЩАЯ ГОЛОВА С ПЕРЕБИВКАМИ"), "talking-head cutaway format must be rendered");
  assert.ok(joinedPrompt.includes("ТРИ КАДРА ОДНОЙ ЧАСТИ:"), "talking-head prompt must use shot-based structure");
  assert.ok(joinedPrompt.includes("во время короткой перебивки речь продолжает звучать как voiceover"), "cutaway voiceover rule must be rendered");
  assert.ok(!joinedPrompt.includes("Один телефонный кадр без перебивок"), "old no-cutaway contract must not reach talking-head prompt");
  assert.ok(!joinedPrompt.includes("ТРИ СОСТОЯНИЯ ОДНОГО МИНИ-ДЕЙСТВИЯ"), "old action-state label must not reach talking-head prompt");
  assert.ok(joinedPrompt.includes("ГЛАВНЫЙ ПЕРСОНАЖ:"), "main character contract must be rendered");
  assert.ok(joinedPrompt.includes("ОДЕЖДА:"), "clothing contract must be rendered");
  assert.ok(joinedPrompt.includes("бежевом свитере"), "specific clothing notes must reach provider prompt");
  assert.ok(joinedPrompt.includes("image_urls задают продукт, а не одежду героя"), "product images must not define hero clothing");
  assert.ok(!joinedPrompt.includes("НЕ ИСПОЛЬЗОВАТЬ КАК ДЕФОЛТ"), "internal anti-default guard must not reach provider prompt");
  assert.ok(!/\b(?:Reels?|Instagram|TikTok|Shorts)\b/u.test(joinedPrompt), "platform names must not reach provider prompt");
  assert.ok(!/спокойный коридор как универсальная сцена|связка ключей как обязательный реквизит/u.test(joinedPrompt));
  assert.ok(!/полотенц|сумк|ключ|органайзер|шоппер/u.test(joinedPrompt), "talking-head prompts must not use old default props");

  process.env.OMNI_PROVIDER_PROMPT_STYLE = "simple_full_body";
  const fullBodyPrompts = buildOmniSegmentPrompts(baseInput);
  delete process.env.OMNI_PROVIDER_PROMPT_STYLE;
  const fullBodyJoinedPrompt = fullBodyPrompts.map((item) => item.prompt).join("\n");
  assert.ok(
    fullBodyPrompts.every((item) => item.creativeStrategy.lifeFormatId !== "talking_head_cutaways"),
    "simple full-body mode must avoid talking-head strategy"
  );
  assert.ok(fullBodyJoinedPrompt.includes("Raw vertical video recording"), "simple full-body prompt must be rendered");
  assert.ok(fullBodyJoinedPrompt.includes("medium-wide full-body shot"), "full-body framing must be explicit");
  assert.ok(fullBodyJoinedPrompt.includes("visible from head to shoes or at least head to knees"), "full height framing must be explicit");
  assert.ok(fullBodyJoinedPrompt.includes("no long pauses"), "full-body prompt must prevent dead air");
  assert.ok(fullBodyJoinedPrompt.includes("Do not invent unrelated filler actions"), "full-body prompt must prevent filler actions");
  assert.ok(fullBodyJoinedPrompt.includes("No on-screen text"), "full-body prompt must explicitly prevent generated overlays");
  assert.ok(fullBodyJoinedPrompt.includes("ТОЧНАЯ РЕПЛИКА"), "exact Russian quote must be preserved");
  assert.ok(!fullBodyJoinedPrompt.includes("ГОВОРЯЩАЯ ГОЛОВА"), "full-body prompt must not ask for talking head");
  assert.ok(!/\b(?:Reels?|Instagram|TikTok|Shorts)\b/u.test(fullBodyJoinedPrompt), "platform names must not reach full-body provider prompt");

  console.log("Omni positive visual prompt regression checks passed");
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
