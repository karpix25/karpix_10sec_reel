import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-product-physical-contract-"));
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
      types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/product-physical-contract.ts"),
      join(ui, "src/lib/server/omni/product-physical-contract-prompt.ts"),
      join(ui, "src/lib/server/omni/openrouter-product-physical-contract-client.ts"),
      join(ui, "src/lib/server/omni/product-visual-profile.ts"),
      join(ui, "src/lib/server/omni/omni-storyboard-image-prompt.ts"),
      join(ui, "src/lib/server/omni/storyboard/**/*.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const {
    cleanProductPhysicalContract,
    renderProductPhysicalContractForOmni,
    renderProductPhysicalHintForStoryboard,
  } = require(findFile(compiled, "product-physical-contract.js"));
  const {
    buildProductPhysicalContractUserPrompt,
    PRODUCT_PHYSICAL_CONTRACT_SYSTEM_PROMPT,
  } = require(findFile(compiled, "product-physical-contract-prompt.js"));
  const { generateProductPhysicalContractText } = require(findFile(compiled, "openrouter-product-physical-contract-client.js"));
  const { buildStoryboardImagePrompt } = require(findFile(compiled, "omni-storyboard-image-prompt.js"));
  const { renderCompactRussianOmniStoryboardPrompt } = require(findFile(compiled, "omni-storyboard-renderer.js"));

  const profile = {
    physical_form: "round translucent dessert in a clear cup",
    package_type: "clear plastic cup",
    colors: ["ruby red", "transparent rim"],
    materials_finish: ["glossy translucent surface"],
    size_proportions: "small single-serve cup",
    labels_text_logo_placement: "small white label centered on cup",
    cap_closure_seal: "",
    texture: "smooth glossy top",
    must_preserve: [],
    must_not_change: [],
    prompt_summary: "Ruby red translucent dessert in a clear cup with a white front label.",
  };

  const systemPrompt = PRODUCT_PHYSICAL_CONTRACT_SYSTEM_PROMPT;
  const userPrompt = buildProductPhysicalContractUserPrompt({
    productName: "Berry Jelly",
    description: "Soft jelly dessert.",
    productReferenceNotes: "It should stay like jelly in the video.",
    productVisualProfile: profile,
    userInstruction: "Полупрозрачное желе, мягко дрожит и остается цельным.",
  });
  assert.ok(systemPrompt.includes("Use positive target-state instructions first"));
  assert.ok(systemPrompt.includes("Do not infer hidden physical behavior from a photo alone"));
  assert.ok(systemPrompt.includes("do not use hardcoded presets"));
  assert.ok(userPrompt.includes("Description: Soft jelly dessert."));
  assert.ok(userPrompt.includes("User physical instruction: Полупрозрачное желе"));
  assert.ok(userPrompt.includes("Visible product passport:"));
  assert.ok(userPrompt.includes("Ruby red"));
  assert.ok(!userPrompt.includes("forbidden_transformations"), "prompt must not require preset JSON lists");

  assert.equal(
    cleanProductPhysicalContract("PRODUCT PHYSICAL CONTRACT:\n```text\nThe product remains cohesive.\n```"),
    "The product remains cohesive."
  );

  const contract = [
    "The product remains a cohesive soft translucent jelly dessert throughout the scene.",
    "It keeps its glossy surface, exact cup shape, and gentle elastic wobble.",
    "Critical drift guard: keep the same material, consistency, and reference design stable.",
  ].join(" ");
  const omniBlock = renderProductPhysicalContractForOmni(contract);
  assert.ok(omniBlock.includes("PRODUCT PHYSICAL CONTRACT:"));
  assert.ok(omniBlock.includes("mandatory whenever the product appears"));
  assert.ok(omniBlock.includes("Stable product state:"));
  assert.ok(omniBlock.includes("same physical form and reference design"));

  const storyboardHint = renderProductPhysicalHintForStoryboard(omniBlock);
  assert.ok(storyboardHint.startsWith("физическое состояние продукта:"));
  assert.ok(!storyboardHint.includes("PRODUCT PHYSICAL CONTRACT:"));
  assert.ok(!storyboardHint.includes("Critical drift guard"));

  const storyboard = buildStoryboard(storyboardHint);
  const imagePrompt = buildStoryboardImagePrompt({
    segmentIndex: 1,
    storyboard,
    productName: "Berry Jelly",
    avatarReferenceUrl: "https://example.com/avatar.jpg",
    productReferenceUrls: ["https://example.com/jelly.jpg"],
  });
  assert.ok(imagePrompt.includes("cohesive soft translucent jelly dessert"));
  assert.ok(!imagePrompt.includes("PRODUCT PHYSICAL CONTRACT:"), "GPT Image prompt must not receive provider heading");

  const omniPrompt = renderCompactRussianOmniStoryboardPrompt({
    storyboard,
    productPhysicalContract: omniBlock,
  });
  assert.ok(omniPrompt.includes("PRODUCT PHYSICAL CONTRACT:"));
  assert.equal(countMatches(omniPrompt, "PRODUCT PHYSICAL CONTRACT:"), 1);

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OMNI_PRODUCT_PHYSICAL_CONTRACT_MODEL = "minimax/minimax-m3";
  let requestPayload = null;
  global.fetch = async (url, init = {}) => {
    requestPayload = JSON.parse(String(init.body));
    return {
      ok: true,
      json: async () => ({
        id: "physical-contract-1",
        model: "minimax/minimax-m3",
        choices: [{ message: { content: `PRODUCT PHYSICAL CONTRACT:\n${contract}` } }],
        usage: { prompt_tokens: 120, completion_tokens: 50, total_tokens: 170 },
      }),
    };
  };

  const generated = await generateProductPhysicalContractText({
    productName: "Berry Jelly",
    description: "Soft jelly dessert.",
    productReferenceNotes: "It should stay like jelly in the video.",
    productVisualProfile: profile,
  });
  assert.equal(requestPayload.model, "minimax/minimax-m3");
  assert.equal(requestPayload.messages.length, 2);
  assert.equal(generated.contract, contract);
  assert.equal(generated.model, "minimax/minimax-m3");

  console.log("Omni product physical contract checks passed");
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

function buildStoryboard(productPhysicalHint) {
  return {
    segmentIndex: 1,
    durationSeconds: 4,
    voiceoverText: "Это желе держит форму и мягко дрожит на тарелке",
    frames: [
      {
        spokenText: "Это желе держит форму",
        visualAction: "герой показывает продукт рядом с тарелкой",
        camera: "крупный бытовой ракурс",
        environment: "кухонный стол с мягким дневным светом",
        wardrobe: "простая одежда героя",
        productPlacement: `желе видно на тарелке; ${productPhysicalHint}`,
        sfxNotes: "тихие звуки комнаты",
        effectNotes: "чистая натуральная картинка",
        modelMusicNotes: null,
      },
      {
        spokenText: "и мягко дрожит на тарелке",
        visualAction: "легкое касание ложкой",
        camera: "макро перебивка продукта",
        environment: "тот же стол",
        wardrobe: "та же одежда",
        productPlacement: `желе видно на тарелке; ${productPhysicalHint}`,
        sfxNotes: "легкий звук касания",
        effectNotes: "чистая натуральная картинка",
        modelMusicNotes: null,
      },
    ],
  };
}

function countMatches(value, pattern) {
  return value.split(pattern).length - 1;
}
