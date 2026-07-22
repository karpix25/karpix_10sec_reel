import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-product-visual-profile-"));
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
      join(ui, "src/lib/server/omni/product-visual-profile.ts"),
      join(ui, "src/lib/server/omni/product-analysis-prompt.ts"),
      join(ui, "src/lib/server/omni/openrouter-product-analysis-client.ts"),
      join(ui, "src/lib/server/omni/openrouter-pricing.ts"),
      join(ui, "src/lib/server/omni/script-json-repair.ts"),
      join(ui, "src/lib/server/omni/omni-prompt-builder.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  copyAlias("creative-contract.js", join(output, "node_modules", "@", "lib", "omni", "creative-contract.js"));
  copyAlias("openrouter-cost.js", join(output, "node_modules", "@", "lib", "omni", "openrouter-cost.js"));

  const {
    normalizeProductVisualProfile,
    renderProductPhysicalityContract,
    renderProductVisualProfileForPrompt,
  } = require(findFile(compiled, "product-visual-profile.js"));
  const { analyzeProductReferenceImages } = require(findFile(compiled, "openrouter-product-analysis-client.js"));
  const { buildOmniSegmentPrompts } = require(findFile(compiled, "omni-prompt-builder.js"));
  const { validateOmniSegmentPrompt } = require(findFile(compiled, "omni-prompt-validator.js"));

  const profile = normalizeProductVisualProfile({
    product_visual_profile: {
      physical_form: "slim vertical single-serve sachet with rounded corners",
      package_type: "matte flexible stick-pack pouch",
      colors: ["bright orange body", "white label panel", "small green accent"],
      materials_finish: ["matte laminated plastic", "soft sealed edges"],
      size_proportions: "tall narrow packet, much taller than wide, palm-sized",
      labels_text_logo_placement: "main brand block centered on the front, nutrition details on a white lower panel",
      cap_closure_seal: "flat heat-sealed top edge with a small tear notch, no cap",
      texture: "smooth matte surface with slight crinkles along the sealed sides",
      must_preserve: [
        "orange sachet body",
        "vertical stick-pack silhouette",
        "white lower label panel",
      ],
      must_not_change: [
        "do not turn it into a bottle or jar",
        "do not add a pump, screw cap, or carton box",
      ],
      prompt_summary: "Show the product as a slim matte orange collagen sachet, tall and narrow, with a white label panel and flat sealed top.",
    },
  });

  assert.ok(profile, "profile JSON must normalize from product_visual_profile wrapper");
  assert.equal(profile.physical_form, "slim vertical single-serve sachet with rounded corners");
  assert.equal(profile.package_type, "matte flexible stick-pack pouch");
  assert.deepEqual(profile.colors, ["bright orange body", "white label panel", "small green accent"]);
  assert.deepEqual(profile.materials_finish, ["matte laminated plastic", "soft sealed edges"]);
  assert.equal(profile.size_proportions, "tall narrow packet, much taller than wide, palm-sized");
  assert.equal(profile.labels_text_logo_placement, "main brand block centered on the front, nutrition details on a white lower panel");
  assert.equal(profile.cap_closure_seal, "flat heat-sealed top edge with a small tear notch, no cap");
  assert.equal(profile.texture, "smooth matte surface with slight crinkles along the sealed sides");
  assert.deepEqual(profile.must_preserve, ["orange sachet body", "vertical stick-pack silhouette", "white lower label panel"]);
  assert.deepEqual(profile.must_not_change, ["do not turn it into a bottle or jar", "do not add a pump, screw cap, or carton box"]);
  assert.ok(profile.prompt_summary.includes("slim matte orange collagen sachet"));

  const passport = renderProductVisualProfileForPrompt(profile);
  assert.ok(passport.includes("PRODUCT VISUAL PASSPORT:"), "rendered profile must use the provider-facing passport label");
  assert.ok(passport.includes("slim vertical single-serve sachet"));
  assert.ok(passport.includes("bright orange body"));
  assert.ok(passport.includes("do not turn it into a bottle or jar"));
  assert.ok(passport.includes("Show the product as a slim matte orange collagen sachet"));
  assert.ok(passport.includes("reference image and this product passport as the exact source of truth"));
  assert.ok(passport.includes("Do not alter package type, silhouette, cap or lid color, label layout"));

  const physicality = renderProductPhysicalityContract(profile);
  assert.ok(physicality.includes("PRODUCT PHYSICALITY:"), "product physicality contract must use a stable marker");
  assert.ok(physicality.includes("casts contact shadows"), "product physicality must require contact shadows");
  assert.ok(physicality.includes("fingers may partially occlude"), "product physicality must require hand occlusion");
  assert.ok(physicality.includes("perspective, label angle, shadows, and highlights move together"), "product physicality must require coherent motion cues");

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OMNI_DIRECTOR_ANALYSIS_MODEL = "minimax/minimax-m3";
  process.env.OMNI_PRODUCT_ANALYSIS_MODEL = "wrong/product-specific-model";
  let requestPayload = null;
  global.fetch = async (url, init = {}) => {
    if (String(url).includes("/api/v1/model/")) {
      return {
        ok: true,
        json: async () => ({ data: { pricing: { prompt: "0.000001", completion: "0.000002" } } }),
      };
    }
    requestPayload = JSON.parse(String(init.body));
    return {
      ok: true,
      json: async () => ({
        id: "gen-product-profile-1",
        model: "minimax/minimax-m3",
        choices: [{ message: { content: JSON.stringify({ product_visual_profile: profile }) } }],
        usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110, cost: 0.00014 },
      }),
    };
  };

  const analyzed = await analyzeProductReferenceImages({
    imageUrls: [
      "https://cdn.example.com/product.png",
      "https://cdn.example.com/product-side.png",
    ],
    productName: "Orange Collagen",
    description: "Daily collagen supplement in orange stick packs.",
    notes: "Keep the orange sachet and white lower panel exact.",
  });
  assert.equal(analyzed.model, "minimax/minimax-m3");
  assert.equal(requestPayload.model, "minimax/minimax-m3", "product analysis must reuse OMNI_DIRECTOR_ANALYSIS_MODEL");
  assert.notEqual(requestPayload.model, "wrong/product-specific-model", "OMNI_PRODUCT_ANALYSIS_MODEL must not be used");
  assert.equal(requestPayload.messages[1].content[1].type, "image_url");
  assert.equal(requestPayload.messages[1].content[1].image_url.url, "https://cdn.example.com/product.png");
  assert.equal(requestPayload.messages[1].content[2].type, "image_url");
  assert.equal(requestPayload.messages[1].content[2].image_url.url, "https://cdn.example.com/product-side.png");
  assert.equal(analyzed.profile.physical_form, profile.physical_form);
  assert.equal(analyzed.openRouterUsage.totalTokens, 110);
  assert.equal(analyzed.responseMetadata.openrouter_usage.generationId, "gen-product-profile-1");

  process.env.OMNI_PROVIDER_PROMPT_STYLE = "simple_full_body";
  const prompts = buildOmniSegmentPrompts(buildPromptInput(profile));
  delete process.env.OMNI_PROVIDER_PROMPT_STYLE;
  const joinedPrompt = prompts.map((item) => item.prompt).join("\n");

  assert.ok(joinedPrompt.includes("PRODUCT VISUAL PASSPORT:"), "final provider prompts must include product visual passport");
  assert.ok(
    prompts.every((item) => item.prompt.includes("PRODUCT VISUAL PASSPORT:")),
    "every active-product segment prompt must include the product visual passport"
  );
  assert.ok(joinedPrompt.includes("PROP CONTINUITY:"), "scene prop continuity must remain separate from product passport");
  assert.ok(joinedPrompt.includes("PRODUCT ACTION:"), "visible product segments must receive a physical product action");
  assert.ok(joinedPrompt.includes("PHYSICAL CAUSALITY:"), "visible product segments must receive physical causality guidance");
  assert.ok(joinedPrompt.includes("PRODUCT PHYSICALITY:"), "visible product segments must receive real-object physicality guidance");
  assert.ok(joinedPrompt.includes("contact shadows"), "product physicality must include contact shadows");
  assert.ok(joinedPrompt.includes("partially occlude the package"), "product physicality must include finger occlusion");
  assert.ok(joinedPrompt.includes("perspective, label angle, shadows, and highlights move together"), "product physicality must bind perspective and highlights");
  assert.ok(
    prompts
      .filter((item) => item.creativePlan.productRole !== "hidden")
      .every((item) => countMatches(item.prompt, "PRODUCT PHYSICALITY:") === 1),
    "visible product prompts must include exactly one physicality contract"
  );
  assert.ok(!/appears from nowhere/iu.test(joinedPrompt.replace(/never appears from nowhere/giu, "")), "prompt must not allow product teleporting");
  assert.ok(joinedPrompt.includes("orange sachet body"), "product-specific preservation rules must reach provider prompt");
  assert.ok(joinedPrompt.includes("do not turn it into a bottle or jar"), "product-specific negative rules must reach provider prompt");
  assert.ok(joinedPrompt.includes("reference image and this product passport as the exact source of truth"));
  assert.ok(joinedPrompt.indexOf("REFERENCE SCENE PASSPORT:") !== joinedPrompt.indexOf("PRODUCT VISUAL PASSPORT:"));

  const missingPassportValidation = validateOmniSegmentPrompt({
    prompt: [
      "ГЛАВНЫЙ ПЕРСОНАЖ: тот же герой.",
      "ОДЕЖДА: та же одежда.",
      "ИСТОЧНИКИ ОБРАЗА: product image_urls define only the product.",
      "REFERENCE SCENE PASSPORT: clean counter plus product area.",
      "СТАРТ РЕЧИ: первое слово точной реплики звучит на 0.0 секунде.",
      'ТОЧНАЯ РЕПЛИКА: "Покажи продукт спокойно."',
    ].join("\n"),
    plan: {
      segmentIndex: 1,
      lifeFormatId: "daily_routine",
      speechStartsAtSeconds: 0,
      voiceoverText: "Покажи продукт спокойно.",
      productRole: "background_prop",
      continuityProps: [],
      scriptBeats: [],
      beats: [
        { startSeconds: 0, endSeconds: 2, action: "говорит рядом с продуктом" },
        { startSeconds: 2, endSeconds: 3, action: "продукт стоит на чистой поверхности" },
        { startSeconds: 3, endSeconds: 4, action: "возврат к лицу" },
      ],
    },
    requiresProductVisualPassport: true,
  });
  assert.ok(
    missingPassportValidation.errors.includes("product_visual_passport_required"),
    "visible product segments must fail validation if the product passport is missing"
  );

  console.log("Omni product visual profile contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function buildPromptInput(productVisualProfile) {
  return {
    generatedScript: {
      id: 1,
      project_id: 1,
      product_id: 1,
      script: "Коллаген легко встроить в утро. Я беру один стик, размешиваю его с водой и продолжаю день без сложного ухода. Артикул можно найти в описании.",
      source_snapshot: { director_analysis: buildDirectorBrief() },
    },
    legacyTranscript: null,
    product: {
      id: 1,
      project_id: 1,
      name: "Orange Collagen",
      description: "Daily collagen supplement in orange stick packs.",
      product_reference_notes: "Keep the orange sachet and white lower panel exact.",
      avatar_reference_notes: "Героиня в черном топе, без логотипов.",
      product_visual_profile: productVisualProfile,
      product_refs: [{
        id: "product-1",
        url: "https://example.com/product.png",
        kind: "image",
        role: "product_primary",
        is_primary: true,
      }],
      avatar_refs: [],
      target_duration_seconds: 30,
      cta_mode: "article_in_description",
      cta_value: null,
    },
    avatar: {
      id: 1,
      project_id: 1,
      display_name: "Anna",
      prompt: "Friendly woman, realistic home UGC style.",
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
    targetAudience: "women who want simple daily beauty care",
    ctaMode: "article_in_description",
    ctaValue: null,
    recentFormatIds: [],
  };
}

function buildDirectorBrief() {
  return {
    visual_hook: {
      action: "Presenter talks directly to camera, then cuts to a clean tabletop product insert.",
      retention_trigger: "Immediate eye contact and a short tactile insert.",
    },
    atmosphere: {
      mood: "Warm, calm, practical.",
      lighting: "Soft warm daylight from a side window.",
      color_grading: "Natural warm contrast.",
      setting: "Small bright kitchen with a clean wooden counter.",
    },
    clothing: {
      style: "Minimal fitted black top.",
      color_palette: ["black"],
      fit_details: "Long-sleeve fitted outfit with no logos.",
    },
    camera: {
      shot_types: ["Medium close-up", "Static tabletop insert"],
      angles: ["Eye-level", "Slight high angle"],
      movements: ["Static"],
      stabilization: "Fixed phone or tripod framing.",
    },
    montage_rhythm: {
      cut_pace: "Slow talking-head rhythm with one short product insert.",
      beat_sync: "Cut on a spoken product mention.",
      transition_style: ["Hard cut"],
    },
    action_beats: [
      { timestamp_sec: 0, action_description: "Presenter faces camera", actor_gesture: "Hands relaxed at chest level" },
      { timestamp_sec: 6, action_description: "Product appears on a clean counter", actor_gesture: "No extra hands unless needed for scale" },
    ],
    reusable_mechanics: {
      visual_mechanics: ["Direct-to-camera explanation", "Clean static product insert"],
      safe_zones_for_elements: "",
      looping_pattern: "Return to the same presenter framing after insert.",
    },
  };
}

function copyAlias(sourceFileName, aliasPath) {
  const sourcePath = findFile(compiled, sourceFileName);
  mkdirSync(dirname(aliasPath), { recursive: true });
  copyFileSync(sourcePath, aliasPath);
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

function countMatches(value, needle) {
  return value.split(needle).length - 1;
}
