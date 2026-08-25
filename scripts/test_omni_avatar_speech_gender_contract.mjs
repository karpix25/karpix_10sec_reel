import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-avatar-speech-gender-"));
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
      join(ui, "src/lib/server/omni/llm-prompt-chain-number-words.ts"),
      join(ui, "src/lib/server/omni/llm-prompt-chain-prompts.ts"),
      join(ui, "src/lib/server/omni/omni-character-contract.ts"),
      join(ui, "src/lib/server/omni/reference-meaning-contract.ts"),
      join(ui, "src/lib/server/omni/russian-speech-gender-contract.ts"),
      join(ui, "src/lib/server/omni/script-prompt-helper.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const speechGender = require(findFile(compiled, "avatar-speech-gender.js"));
  const russianContract = require(findFile(compiled, "russian-speech-gender-contract.js"));
  const characterContract = require(findFile(compiled, "omni-character-contract.js"));
  const promptChainPrompts = require(findFile(compiled, "llm-prompt-chain-prompts.js"));
  const scriptPrompt = require(findFile(compiled, "script-prompt-helper.js"));

  assert.equal(speechGender.normalizeAvatarSpeechGender("male"), "male");
  assert.equal(speechGender.normalizeAvatarSpeechGender("female"), "female");
  assert.equal(speechGender.normalizeAvatarSpeechGender("neutral"), null);
  assert.throws(() => speechGender.requireAvatarSpeechGender(null), /male or female/);

  assert.equal(russianContract.validateRussianSpeechGender("я заметил это сразу", "male").length, 0);
  assert.equal(russianContract.validateRussianSpeechGender("Я сначала боялся тратить деньги", "male").length, 0);
  assert.equal(russianContract.validateRussianSpeechGender("я заметила это сразу", "male")[0].matchedText, "я заметила");
  assert.equal(russianContract.validateRussianSpeechGender("я мама и мой макияж поплыл", "male")[0].matchedText, "я мама");
  assert.equal(russianContract.validateRussianSpeechGender("я заметила это сразу", "female").length, 0);
  assert.equal(russianContract.validateRussianSpeechGender("я заметил это сразу", "female")[0].matchedText, "я заметил");
  assert.equal(russianContract.validateRussianSpeechGender("я отец и это мой уход", "female")[0].matchedText, "я отец");
  assert.equal(russianContract.normalizeRussianSpeechGender("Я нашла", "male"), "Я нашел");
  assert.equal(russianContract.normalizeRussianSpeechGender("Я была готова", "male"), "Я был готова");
  assert.equal(russianContract.normalizeRussianSpeechGender("Я сделал", "female"), "Я сделала");
  assert.equal(russianContract.normalizeRussianSpeechGender("Я сначала проверил", "female"), "Я сначала проверил");
  assert.equal(russianContract.normalizeRussianSpeechGender("Я мама и мой макияж поплыл", "male"), "Я мама и мой макияж поплыл");
  assert.throws(
    () => russianContract.assertRussianSpeechGender("я попробовала и поняла", "male"),
    /Russian speech gender mismatch/
  );

  const maleContract = characterContract.buildOmniCharacterContract({
    product: { avatar_reference_notes: null },
    avatar: {
      display_name: "Миша",
      speech_gender: "male",
      prompt: "Мужчина, одежда: темная футболка.",
      reference_url: "https://example.com/avatar.png",
      kie_character_id: "char_misha",
    },
  });
  assert.equal(maleContract.speechGender, "male");
  assert.ok(maleContract.speechGenderLine.includes("мужской"));
  assert.ok(maleContract.speechGenderLine.includes("я заметил"));

  assert.throws(
    () => characterContract.buildOmniCharacterContract({
      product: { avatar_reference_notes: null },
      avatar: {
        display_name: "Legacy",
        speech_gender: null,
        prompt: "Аватар без выбранного рода речи.",
        reference_url: "https://example.com/avatar.png",
        kie_character_id: "char_legacy",
      },
    }),
    /male or female/
  );

  const promptInput = buildPromptInput("female");
  const copywriterPrompt = promptChainPrompts.buildCreativeCopywriterPrompt(promptInput);
  assert.ok(copywriterPrompt.includes("Грамматический род говорящего: женский"));
  assert.ok(copywriterPrompt.includes("я заметила"));
  assert.ok(copywriterPrompt.includes("адаптируй мужские бытовые маркеры под женского аватара"));

  const directorPrompt = promptChainPrompts.buildDirectorSegmenterPrompt({
    chainInput: promptInput,
    draft: { version: "llm-prompt-chain-v1", script: "я заметила разницу сразу", hookAngle: null, creativeNotes: null },
    segmentPlan: {
      totalDurationSeconds: 4,
      segmentDurationsSeconds: [4],
      segments: [{ text: "я заметила разницу сразу", wordCount: 4 }],
    },
  });
  assert.ok(directorPrompt.includes("Грамматический род говорящего: женский"));

  const classicPrompt = scriptPrompt.buildPrompt({ ...promptInput, avatarSpeechGender: "male" });
  assert.ok(classicPrompt.includes("Грамматический род говорящего: мужской"));
  assert.ok(classicPrompt.includes("я заметил"));
  assert.ok(classicPrompt.includes("адаптируй женские бытовые маркеры под мужского аватара"));

  console.log("Omni avatar speech gender contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function buildPromptInput(avatarSpeechGender) {
  return {
    projectName: "Omni Reels",
    targetAudience: "люди, которые покупают товары для дома",
    brandVoice: "живой",
    productName: "Аэрогриль",
    productDescription: "Компактный аэрогриль для кухни",
    productReferenceNotes: "черная упаковка",
    ctaMode: "article_in_description",
    ctaValue: null,
    sourceScenario: {
      id: 1,
      client_id: null,
      script: "Я заметила, что ужин получается проще, когда техника стоит под рукой.",
      title: null,
      topic: null,
      created_at: null,
      source_reference: null,
    },
    directorBrief: null,
    wardrobeSource: "avatar_reference",
    durationRange: {
      requestedMinSeconds: 20,
      requestedMaxSeconds: 30,
      minSeconds: 20,
      maxSeconds: 30,
      minWords: 40,
      maxWords: 72,
      source: "client_settings",
      wasClamped: false,
    },
    avatarSpeechGender,
    adaptationPlan: {
      version: "script-adaptation-v1",
      mode: "preserve_reference",
      reason: "Reference and product solve the same need.",
      preserve: ["personal delivery", "practical benefit"],
      replace: ["unrelated source brand"],
      productBridge: "Connect the current need to the product benefit.",
      confidence: 0.9,
    },
  };
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
