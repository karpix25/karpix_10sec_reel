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
  assert.ok(fullBodyJoinedPrompt.includes("Raw vertical video recording"), "simple provider prompt must be rendered");
  assert.ok(!/medium-wide full-body shot|head to shoes|head to knees/u.test(fullBodyJoinedPrompt), "generic full-body framing must not be forced");
  assert.ok(fullBodyJoinedPrompt.includes("no long pauses"), "simple provider prompt must prevent dead air");
  assert.ok(/do not invent unrelated filler actions/iu.test(fullBodyJoinedPrompt), "simple provider prompt must prevent filler actions");
  assert.ok(fullBodyJoinedPrompt.includes("No on-screen text"), "simple provider prompt must explicitly prevent generated overlays");
  assert.ok(fullBodyJoinedPrompt.includes("ТОЧНАЯ РЕПЛИКА"), "exact Russian quote must be preserved");
  assert.ok(!/\b(?:Reels?|Instagram|TikTok|Shorts)\b/u.test(fullBodyJoinedPrompt), "platform names must not reach simple provider prompt");
  assert.ok(
    fullBodyPrompts.some((item) => item.creativePlan.productRole !== "hidden"),
    "physical products with image references must not be hidden in every simple-provider segment"
  );
  assert.ok(
    fullBodyPrompts.some((item) => item.referenceUrl === "https://example.com/product.png"),
    "a visible physical product segment must use the product reference URL"
  );

  const directorBrief = {
    visual_hook: {
      action: "Subject holds a product box directly toward the camera while speaking.",
      retention_trigger: "Immediate direct address and product presentation.",
    },
    atmosphere: {
      mood: "Educational, intimate, professional.",
      lighting: "Soft warm directional light on the face.",
      color_grading: "Warm amber tones.",
      setting: "Indoor room with a warm solid-colored wall and a hint of curtain in the background.",
    },
    clothing: {
      style: "Minimalist fitted black top.",
      color_palette: ["black"],
      fit_details: "Long-sleeve high-neckline fitted outfit with simple jewelry.",
    },
    camera: {
      shot_types: ["Medium close-up", "Wide B-roll insert"],
      angles: ["Eye-level"],
      movements: ["Static"],
      stabilization: "Fixed phone or tripod framing.",
    },
    montage_rhythm: {
      cut_pace: "Slow to medium talking-head rhythm with short inserts.",
      beat_sync: "Cuts align with topic shifts.",
      transition_style: ["Hard cuts"],
    },
    action_beats: [
      { timestamp_sec: 0, action_description: "Presents product box", actor_gesture: "Both hands at chest level" },
    ],
    reusable_mechanics: {
      visual_mechanics: ["Direct-to-camera educational talking head", "Brief contrasting inserts"],
      safe_zones_for_elements: "",
      looping_pattern: "Return to the same speaker after each insert.",
    },
  };
  const directorInput = {
    ...baseInput,
    generatedScript: {
      ...baseInput.generatedScript,
      source_snapshot: { director_analysis: directorBrief },
    },
  };
  process.env.OMNI_PROVIDER_PROMPT_STYLE = "simple_full_body";
  const directorPrompts = buildOmniSegmentPrompts(directorInput);
  delete process.env.OMNI_PROVIDER_PROMPT_STYLE;
  const directorJoinedPrompt = directorPrompts.map((item) => item.prompt).join("\n");
  assert.ok(directorJoinedPrompt.includes("REFERENCE SCENE:"), "director scene must override preset scene");
  assert.ok(directorJoinedPrompt.includes("REFERENCE LOCK:"), "director prompt must lock to reference direction");
  assert.ok(directorJoinedPrompt.includes("REFERENCE FRAMING: Medium close-up, Wide B-roll insert"), "director framing must reach provider prompt");
  assert.ok(directorJoinedPrompt.includes("warm solid-colored wall"), "reference environment must reach provider prompt");
  assert.ok(directorJoinedPrompt.includes("Minimalist fitted black top"), "reference wardrobe must reach provider prompt");
  assert.ok(directorJoinedPrompt.includes("Soft warm directional light"), "reference lighting must reach provider prompt");
  assert.ok(directorJoinedPrompt.includes("REFERENCE EDITING: Slow to medium talking-head rhythm"), "reference editing rhythm must reach provider prompt");
  assert.ok(directorJoinedPrompt.includes("replace any original product or brand with the new product"), "only product replacement exception must reach provider prompt");
  assert.ok(directorJoinedPrompt.includes("REFERENCE SCENE PASSPORT:"), "reference prop passport must replace preset props");
  assert.ok(
    !/полотенц|сумк|ключ|органайзер|шоппер|у светлого стола рядом с окном|у скамьи|medium-wide full-body shot|head to shoes|4-6 quick cuts/u.test(directorJoinedPrompt),
    "director-based prompts must not leak preset props, preset settings, or generic framing/editing"
  );

  const irrelevantDirectorBrief = {
    visual_hook: {
      action: "Direct-to-camera presenter address intercut with tactile, close-up food assembly B-roll.",
      retention_trigger: "Rhythmic alternation between explanation and sensory visuals of food portioning.",
    },
    atmosphere: {
      mood: "Professional, clean, informative, and appetizing.",
      lighting: "Soft frontal light on presenter and bright overhead industrial lighting in commercial kitchen scenes.",
      color_grading: "Neutral crisp contrast.",
      setting: "Dark studio for presenter and sterile stainless-steel commercial kitchen for B-roll.",
    },
    clothing: {
      style: "Professional culinary or medical uniform.",
      color_palette: ["white", "black"],
      fit_details: "Presenter wears a white tunic; kitchen staff wear black nitrile gloves.",
    },
    camera: {
      shot_types: ["Medium shot", "Close-up", "Extreme close-up"],
      angles: ["Eye-level", "High angle"],
      movements: ["Static"],
      stabilization: "Tripod or gimbal, very steady.",
    },
    montage_rhythm: {
      cut_pace: "Moderate rhythm alternating presenter and 2-3 second B-roll.",
      beat_sync: "Cuts align with speech cadence and food prep actions.",
      transition_style: ["Hard cut"],
    },
    action_beats: [
      { timestamp_sec: 0, action_description: "Presenter stands facing camera", actor_gesture: "Hands clasped" },
      { timestamp_sec: 2, action_description: "Gloved hands place sliced meat into a plastic container", actor_gesture: "Precise pinching motion" },
      { timestamp_sec: 3, action_description: "Container is placed onto a digital scale", actor_gesture: "Careful placement" },
    ],
    reusable_mechanics: {
      visual_mechanics: ["Alternating explain and show", "ASMR-style close-ups of food assembly"],
      safe_zones_for_elements: "",
      looping_pattern: "Returns to the static presenter after each insert.",
    },
  };
  const irrelevantInput = {
    ...baseInput,
    generatedScript: {
      ...baseInput.generatedScript,
      source_snapshot: { director_analysis: irrelevantDirectorBrief },
    },
  };
  process.env.OMNI_PROVIDER_PROMPT_STYLE = "simple_full_body";
  const irrelevantPrompts = buildOmniSegmentPrompts(irrelevantInput);
  delete process.env.OMNI_PROVIDER_PROMPT_STYLE;
  const irrelevantJoinedPrompt = irrelevantPrompts.map((item) => item.prompt).join("\n");
  assert.ok(
    irrelevantJoinedPrompt.includes("use the original reference only for transferable direction"),
    "irrelevant references must be downgraded to style-only transfer"
  );
  assert.ok(
    irrelevantJoinedPrompt.includes("new product reference in a clean static cutaway"),
    "irrelevant reference inserts must be remapped to the new product"
  );
  assert.ok(
    irrelevantPrompts.some((item) => item.creativePlan.productRole !== "hidden"),
    "style-only references must still keep at least one visible product segment"
  );
  assert.ok(
    irrelevantPrompts.some((item) => item.referenceUrl === "https://example.com/product.png"),
    "style-only visible product segment must use the product reference"
  );
  assert.ok(
    !/commercial kitchen|food assembly|sliced meat|plastic container|digital scale|food prep actions|ASMR-style close-ups of food/u.test(irrelevantJoinedPrompt),
    "style-only prompt must not leak unrelated reference B-roll objects or processes"
  );

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
