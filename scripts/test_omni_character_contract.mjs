import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-character-contract-"));
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
      join(ui, "src/lib/omni/types.ts"),
      join(ui, "src/lib/server/omni/omni-reference-scene-mode.ts"),
      join(ui, "src/lib/server/omni/omni-character-contract.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const { buildOmniCharacterContract } = require(findFile(compiled, "omni-character-contract.js"));
  const {
    applyReferenceSceneModeToOmniPrompt,
    resolveReferenceSceneMode,
  } = require(findFile(compiled, "omni-reference-scene-mode.js"));
  const productNotesContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: "Героиня в молочном худи и синих джинсах, без ярких логотипов." },
    avatar: {
      display_name: "Анна",
      speech_gender: "female",
      prompt: "Улыбчивая девушка, одежда из исходника не важна.",
      reference_url: "https://example.com/avatar.png",
      kie_character_id: "char_123",
    },
  });
  assert.equal(productNotesContract.clothingSource, "product_avatar_notes");
  assert.ok(productNotesContract.identityLine.includes("Анна"));
  assert.ok(productNotesContract.clothingLine.includes("молочном худи"));
  assert.ok(productNotesContract.sourceRuleLine.includes("image_urls задают продукт, а не одежду героя"));

  const avatarPromptContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: null },
    avatar: {
      display_name: null,
      speech_gender: "male",
      prompt: "Молодой мужчина, dressed in a plain black t-shirt and relaxed jeans.",
      reference_url: null,
      kie_character_id: "char_456",
    },
  });
  assert.equal(avatarPromptContract.clothingSource, "avatar_prompt");
  assert.ok(avatarPromptContract.clothingLine.includes("black t-shirt"));

  const apronAvatarContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: null },
    avatar: {
      display_name: "МИША",
      speech_gender: "male",
      prompt: "Спортивный мужчина, с голубыми глазами, блондин, спортивное телосложение, в фартуке на кухне",
      reference_url: "https://example.com/misha.png",
      kie_character_id: "char_misha",
    },
  });
  assert.equal(apronAvatarContract.clothingSource, "avatar_prompt");
  assert.ok(apronAvatarContract.clothingLine.includes("фартуке"));
  assert.ok(!apronAvatarContract.clothingLine.includes("однотонный светлый верх"));

  const sourceClothingNoiseContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: null },
    avatar: {
      display_name: null,
      speech_gender: "female",
      prompt: "Улыбчивая девушка, одежда из исходника не важна.",
      reference_url: "https://example.com/avatar.png",
      kie_character_id: "char_789",
    },
  });
  assert.equal(sourceClothingNoiseContract.clothingSource, "fallback");
  assert.ok(!sourceClothingNoiseContract.clothingLine.includes("исходника"));

  const fallbackContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: null },
    avatar: { display_name: null, speech_gender: "male", prompt: "", reference_url: null, kie_character_id: null },
  });
  assert.equal(fallbackContract.clothingSource, "fallback");
  assert.ok(fallbackContract.clothingLine.includes("фиксированный бытовой outfit"));

  const objectOnlyContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: null },
    avatar: null,
    referenceSceneMode: "object_only",
  });
  assert.equal(objectOnlyContract.speechGender, "female");
  assert.ok(objectOnlyContract.identityLine.includes("только утверждённая поверхность"));
  assert.ok(!objectOnlyContract.identityLine.includes("главный персонаж"));

  assert.equal(resolveReferenceSceneMode({
    reference_action_style: "Handwritten explainer / whiteboard-style tutorial on a refrigerator door, talking-head offscreen narration",
    camera: { shot_types: ["close-up of hands"] },
    action_beats: [{ action_description: "hand attaches a paper", actor_gesture: "writes with a marker" }],
  }), "faceless_hands");
  assert.equal(resolveReferenceSceneMode({
    reference_action_style: "talking-head explanation",
    camera: { shot_types: ["medium close-up"] },
    action_beats: [{ action_description: "speaker looks into camera", actor_gesture: "nods" }],
  }), "presenter");
  const modePrompt = [
    "Лицо и личность персонажа бери из avatar/character reference.",
    "Фиксируй те же волосы, пробор, аксессуары.",
    "В каждом talking-head кадре персонаж смотрит прямо в объектив.",
    "The avatar says: текущая реплика",
  ].join("\n");
  const facelessPrompt = applyReferenceSceneModeToOmniPrompt(modePrompt, "faceless_hands");
  assert.ok(facelessPrompt.includes("FACELESS HANDS-ONLY"));
  assert.ok(facelessPrompt.includes("off-camera narrator"));
  assert.ok(!facelessPrompt.includes("The avatar says"));
  assert.ok(!facelessPrompt.includes("В каждом talking-head"));
  const objectOnlyPrompt = applyReferenceSceneModeToOmniPrompt(modePrompt, "object_only");
  assert.ok(objectOnlyPrompt.includes("OBJECT-ONLY"));
  assert.ok(objectOnlyPrompt.includes("Never show a person"));
  assert.ok(!objectOnlyPrompt.includes("FACELESS HANDS-ONLY"));
  assert.equal(applyReferenceSceneModeToOmniPrompt(modePrompt, "presenter"), modePrompt);

  console.log("Omni character contract regression checks passed");
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
