import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-director-analysis-"));
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
      join(ui, "src/lib/omni/creative-contract.ts"),
      join(ui, "src/lib/omni/openrouter-cost.ts"),
      join(ui, "src/lib/server/omni/director-analysis-types.ts"),
      join(ui, "src/lib/server/omni/director-analysis-policy.ts"),
      join(ui, "src/lib/server/omni/director-analysis-prompt.ts"),
      join(ui, "src/lib/server/omni/director-scene-contract.ts"),
      join(ui, "src/lib/server/omni/omni-reference-transfer-policy.ts"),
      join(ui, "src/lib/server/omni/omni-simple-ugc-prompt.ts"),
      join(ui, "src/lib/server/omni/scrapecreators-client.ts"),
      join(ui, "src/lib/server/omni/openrouter-director-analysis-client.ts"),
      join(ui, "src/lib/server/omni/openrouter-pricing.ts"),
      join(ui, "src/lib/server/omni/script-json-repair.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const contractOutput = findFile(compiled, "creative-contract.js");
  const aliasContract = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(aliasContract), { recursive: true });
  copyFileSync(contractOutput, aliasContract);
  const costOutput = findFile(compiled, "openrouter-cost.js");
  const aliasCost = join(output, "node_modules", "@", "lib", "omni", "openrouter-cost.js");
  copyFileSync(costOutput, aliasCost);

  const { normalizeDirectorBrief } = require(findFile(compiled, "director-analysis-types.js"));
  const { shouldAnalyzeDirectorReference } = require(findFile(compiled, "director-analysis-policy.js"));
  const { renderDirectorBriefForOmniPrompt } = require(findFile(compiled, "director-analysis-prompt.js"));
  const { buildReferenceTransferPolicy } = require(findFile(compiled, "omni-reference-transfer-policy.js"));
  const { renderSimpleFullBodyUgcPrompt } = require(findFile(compiled, "omni-simple-ugc-prompt.js"));
  const { extractScrapeCreatorsInstagramVideo } = require(findFile(compiled, "scrapecreators-client.js"));
  const { analyzeDirectorVideo } = require(findFile(compiled, "openrouter-director-analysis-client.js"));

  const scrapeResult = extractScrapeCreatorsInstagramVideo({
    data: {
      xdt_shortcode_media: {
        id: "media-1",
        shortcode: "abc123",
        video_url: "https://cdn.example.com/direct.mp4",
        video_duration: 10,
        is_video: true,
      },
    },
  });
  assert.equal(scrapeResult.videoUrl, "https://cdn.example.com/direct.mp4");
  assert.equal(scrapeResult.metadata.shortcode, "abc123");
  assert.equal(
    shouldAnalyzeDirectorReference({ reels_url: "https://www.instagram.com/reel/C80JdaJM6_C" }),
    true,
    "any resolved legacy source with an original reel must request director analysis"
  );
  assert.equal(shouldAnalyzeDirectorReference({ reels_url: "   " }), false);
  assert.equal(shouldAnalyzeDirectorReference({ reels_url: null }), false);

  const brief = normalizeDirectorBrief({
    director_brief: {
      visual_hook: { action: "full-body presenter steps into a bright kitchen", retention_trigger: "movement starts before the first word" },
      atmosphere: { mood: "warm and fast", lighting: "bright domestic daylight", color_grading: "clean natural contrast", setting: "small kitchen" },
      clothing: { style: "casual fitted home outfit", color_palette: ["white", "sage"], fit_details: "clean silhouette, hands visible" },
      camera: { shot_types: ["medium-wide", "detail insert"], angles: ["eye-level"], movements: ["tiny handheld push-in"], stabilization: "handheld but readable" },
      montage_rhythm: { cut_pace: "4 quick cuts in 10 seconds", beat_sync: "cuts follow spoken beats", transition_style: ["jump cut"] },
      action_beats: [{ timestamp_sec: 0, action_description: "steps into frame", actor_gesture: "raises product to chest level" }],
      reusable_mechanics: {
        visual_mechanics: ["start already moving", "cut on each new claim"],
        safe_zones_for_elements: "bottom captions area",
        looping_pattern: "ends in same standing position",
      },
    },
  });
  assert.ok(brief);
  const rendered = renderDirectorBriefForOmniPrompt(brief);
  assert.ok(rendered.includes("full-body presenter"));
  assert.ok(rendered.includes("4 quick cuts"));
  assert.ok(!rendered.includes("bottom captions area"), "post-production safe zones must not reach provider prompt");
  assert.ok(!/\b(?:Instagram|Reels|TikTok|Shorts)\b/u.test(rendered), "platform imprint terms must not be rendered");

  const closeUpBrief = normalizeDirectorBrief({
    director_brief: {
      visual_hook: { action: "speaker talks directly to camera", retention_trigger: "urgent eye contact" },
      atmosphere: {
        mood: "authoritative clinical urgent",
        lighting: "flat even frontal light",
        color_grading: "neutral cool white balance",
        setting: "plain indoor wall",
      },
      clothing: {
        style: "casual professional neutral top",
        color_palette: ["black"],
        fit_details: "long-sleeve fitted high-neckline top",
      },
      camera: {
        shot_types: ["medium close-up", "close-up"],
        angles: ["eye-level"],
        movements: ["static"],
        stabilization: "locked-off tripod",
      },
      montage_rhythm: {
        cut_pace: "single continuous take or very minimal cutting",
        beat_sync: "speech cadence only",
        transition_style: ["hard cut"],
      },
      action_beats: [{ timestamp_sec: 0, action_description: "talks to camera", actor_gesture: "subtle head movement" }],
      reusable_mechanics: {
        visual_mechanics: ["locked-off medium close-up", "direct-to-camera authority delivery"],
        safe_zones_for_elements: "lower third",
        looping_pattern: "reset to neutral face",
      },
    },
  });
  const simplePrompt = renderSimpleFullBodyUgcPrompt({
    plan: {
      segmentIndex: 1,
      lifeFormatId: "talking_head_cutaways",
      speechStartsAtSeconds: 0,
      voiceoverText: "После тридцати лет коллаген важно восполнять каждый день.",
      productRole: "background_prop",
      continuityProps: [],
      beats: [
        { startSeconds: 0, endSeconds: 6, action: "говорит в камеру" },
        { startSeconds: 6, endSeconds: 8, action: "перебивка продукта" },
        { startSeconds: 8, endSeconds: 10, action: "возврат к лицу" },
      ],
    },
    strategy: { setting: "fallback setting" },
    characterContract: {
      identityLine: "главный персонаж",
      clothingLine: "fallback outfit",
      sourceRuleLine: "character_id sets identity",
      clothingSource: "fallback",
    },
    productName: "Апельсиновый коллаген",
    segmentIndex: 1,
    segmentCount: 2,
    directorBrief: closeUpBrief,
  });
  assert.ok(simplePrompt.includes("REFERENCE LOCK:"), "director prompt must lock to reference direction");
  assert.ok(simplePrompt.includes("REFERENCE FRAMING: medium close-up, close-up"), "director framing must reach provider prompt");
  assert.ok(simplePrompt.includes("REFERENCE WARDROBE: casual professional neutral top"), "director wardrobe must reach provider prompt");
  assert.ok(simplePrompt.includes("REFERENCE EDITING: single continuous take or very minimal cutting"), "director editing must reach provider prompt");
  assert.ok(simplePrompt.includes("replace any original product or brand with the new product"));
  assert.ok(simplePrompt.includes("replace it with this product while preserving the same placement, timing, framing"));
  assert.ok(!/medium-wide full-body|head to shoes|4-6 quick cuts|fast-paced realistic montage/u.test(simplePrompt));

  const irrelevantPolicy = buildReferenceTransferPolicy({
    directorBrief: brief,
    productName: "Апельсиновый коллаген",
    productDescription: "БАД для красоты кожи, волос и суставов",
    productReferenceNotes: null,
    hasProductReference: true,
  });
  assert.equal(irrelevantPolicy.mode, "style_only", "meal-prep reference must become style-only for collagen product");
  const styleOnlyPrompt = renderSimpleFullBodyUgcPrompt({
    plan: {
      segmentIndex: 1,
      lifeFormatId: "talking_head_cutaways",
      speechStartsAtSeconds: 0,
      voiceoverText: "Коллаген легко встроить в утренний уход.",
      productRole: "background_prop",
      continuityProps: [],
      beats: [
        { startSeconds: 0, endSeconds: 6, action: "говорит в камеру" },
        { startSeconds: 6, endSeconds: 8, action: "перебивка продукта" },
        { startSeconds: 8, endSeconds: 10, action: "возврат к лицу" },
      ],
    },
    strategy: { setting: "fallback setting" },
    characterContract: {
      identityLine: "главный персонаж",
      clothingLine: "fallback outfit",
      sourceRuleLine: "character_id sets identity",
      clothingSource: "fallback",
    },
    productName: "Апельсиновый коллаген",
    segmentIndex: 1,
    segmentCount: 2,
    directorGuidance: rendered,
    directorBrief: brief,
    referencePolicy: irrelevantPolicy,
  });
  assert.ok(styleOnlyPrompt.includes("new product reference in a clean static cutaway"));
  assert.ok(styleOnlyPrompt.includes("small kitchen"), "safe presenter background can still transfer in style-only mode");
  assert.ok(!/food assembly|sliced meat|plastic container|digital scale|bottom captions area/u.test(styleOnlyPrompt));

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OMNI_DIRECTOR_ANALYSIS_MODEL = "minimax/minimax-m3";
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
        id: "gen-director-1",
        model: "minimax/minimax-m3",
        choices: [{ message: { content: JSON.stringify({ director_brief: brief }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 23, total_tokens: 123, cost: 0.000146 },
      }),
    };
  };
  const analyzed = await analyzeDirectorVideo({
    videoUrl: "https://cdn.example.com/direct.mp4",
    transcript: "Тестовая русская реплика.",
  });
  assert.equal(analyzed.model, "minimax/minimax-m3");
  assert.equal(requestPayload.model, "minimax/minimax-m3");
  assert.equal(requestPayload.messages[1].content[1].type, "video_url");
  assert.equal(requestPayload.messages[1].content[1].video_url.url, "https://cdn.example.com/direct.mp4");
  assert.equal(analyzed.openRouterUsage.totalTokens, 123);
  assert.equal(analyzed.openRouterUsage.costUsd, 0.000146);
  assert.equal(analyzed.responseMetadata.openrouter_usage.generationId, "gen-director-1");

  console.log("Omni director analysis contract checks passed");
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
