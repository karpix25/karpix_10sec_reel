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
const RAW_FILMING_SUPPORT_PATTERN = /Fixed phone or tripod|Tripod or gimbal|Fixed mount or tripod|locked-off tripod/iu;

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

  const { normalizeDirectorBrief, selectDirectorSegmentProfile } = require(findFile(compiled, "director-analysis-types.js"));
  const { shouldAnalyzeDirectorReference } = require(findFile(compiled, "director-analysis-policy.js"));
  const { buildDirectorAnalysisUserPrompt, renderDirectorBriefForOmniPrompt } = require(findFile(compiled, "director-analysis-prompt.js"));
  const {
    buildReferenceTransferPolicy,
    buildReferenceTransferFramePlan,
    resolveReferenceTransferAction,
  } = require(findFile(compiled, "omni-reference-transfer-policy.js"));
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
      clothing: {
        style: "casual fitted home outfit",
        color_palette: ["white", "sage"],
        fit_details: "clean silhouette, hands visible",
        source: "main presenter",
        adaptation_notes: "adapt casual home outfit to avatar gender/body while preserving white and sage palette",
      },
      location_timeline: [
        { start_sec: 0, end_sec: 8, setting: "small kitchen", environment: "warm home counter", lighting: "bright domestic daylight" },
        { start_sec: 8, end_sec: 16, setting: "near kitchen table", environment: "same home, closer product surface", lighting: "bright domestic daylight" },
      ],
      camera_timeline: [
        {
          start_sec: 0,
          end_sec: 8,
          shot_types: ["medium-wide"],
          angles: ["eye-level"],
          movements: ["tiny handheld push-in"],
          stabilization: "handheld but readable",
          setting: "small kitchen",
          environment: "warm home counter",
          lighting: "bright domestic daylight",
          action_description: "steps into frame",
          actor_gesture: "open palm gesture",
        },
        {
          start_sec: 8,
          end_sec: 16,
          shot_types: ["detail insert"],
          angles: ["high three-quarter angle"],
          movements: ["handheld close approach"],
          stabilization: "natural phone micro-shake",
          setting: "near kitchen table",
          environment: "same home, closer product surface",
          lighting: "bright domestic daylight",
          action_description: "leans toward the counter",
          actor_gesture: "points at the surface",
        },
      ],
      camera: { shot_types: ["medium-wide", "detail insert"], angles: ["eye-level"], movements: ["tiny handheld push-in"], stabilization: "handheld but readable" },
      montage_rhythm: { cut_pace: "4 quick cuts in 10 seconds", beat_sync: "cuts follow spoken beats", transition_style: ["jump cut"] },
      action_beats: [{ timestamp_sec: 0, action_description: "steps into frame", actor_gesture: "raises product to chest level" }],
      prop_sources: ["product starts on the counter before the presenter touches it"],
      hand_object_interactions: ["right hand picks up the product and rotates it once"],
      motion_continuity: ["object movement follows visible hand contact and returns to the counter"],
      reference_action_style: "talking-head explanation with one physical product insert",
      reusable_mechanics: {
        visual_mechanics: ["start already moving", "cut on each new claim"],
        safe_zones_for_elements: "bottom captions area",
        looping_pattern: "ends in same standing position",
      },
    },
  });
  assert.ok(brief);
  assert.equal(brief.prop_sources[0], "product starts on the counter before the presenter touches it");
  assert.equal(brief.hand_object_interactions[0], "right hand picks up the product and rotates it once");
  assert.equal(brief.motion_continuity[0], "object movement follows visible hand contact and returns to the counter");
  const laterProfile = selectDirectorSegmentProfile({
    brief,
    segmentIndex: 2,
    segmentCount: 2,
    frameIndex: 1,
    frameCount: 4,
  });
  assert.equal(laterProfile.camera.shot_types[0], "detail insert");
  assert.equal(laterProfile.setting, "near kitchen table");
  assert.equal(laterProfile.actor_gesture, "points at the surface");
  const analysisPrompt = buildDirectorAnalysisUserPrompt({ transcript: "Тест" });
  assert.ok(analysisPrompt.includes("camera_timeline"));
  assert.ok(analysisPrompt.includes("reference_render_mode"));
  assert.ok(analysisPrompt.includes("reference_motion_mode"));
  assert.ok(analysisPrompt.includes("raw smartphone texture"));
  const rendered = renderDirectorBriefForOmniPrompt(brief);
  assert.ok(rendered.includes("full-body presenter"));
  assert.ok(!rendered.includes("4 quick cuts"), "reference montage rhythm must not reach provider prompt");
  assert.ok(rendered.includes("LOCATION TIMELINE"));
  assert.ok(rendered.includes("HAND-PROP DNA: right hand picks up the product"));
  assert.ok(rendered.includes("MOTION CONTINUITY: object movement follows visible hand contact"));
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
        source: "main presenter",
        adaptation_notes: "adapt neutral professional top to avatar gender/body",
      },
      location_timeline: [
        { start_sec: 0, end_sec: 10, setting: "plain indoor wall", environment: "authoritative direct-to-camera room", lighting: "flat even frontal light" },
      ],
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
  assert.ok(simplePrompt.includes("LOCATION"), "director prompt must render location guidance");
  assert.ok(simplePrompt.includes("CAMERA/LIGHT: medium close-up, close-up"), "director framing must reach provider prompt");
  assert.ok(simplePrompt.includes("WARDROBE: adapt main presenter"), "director wardrobe must reach provider prompt");
  assert.ok(!simplePrompt.includes("REFERENCE EDITING:"), "director editing rhythm must not reach provider prompt");
  assert.ok(!simplePrompt.includes("single continuous take or very minimal cutting"), "reference montage rhythm must not be copied");
  assert.ok(simplePrompt.includes("stable locked-off camera framing"), "tripod stabilization should become stable off-camera framing");
  assert.ok(simplePrompt.includes("filming equipment is never visible"), "director prompt must ban visible filming gear");
  assert.ok(!RAW_FILMING_SUPPORT_PATTERN.test(simplePrompt), "raw tripod wording must not reach provider prompt");
  assert.ok(simplePrompt.includes("PRODUCT: Апельсиновый коллаген"));
  assert.ok(!/medium-wide full-body|head to shoes|4-6 quick cuts|fast-paced realistic montage/u.test(simplePrompt));

  const irrelevantPolicy = buildReferenceTransferPolicy({
    directorBrief: brief,
    productName: "Апельсиновый коллаген",
    productDescription: "БАД для красоты кожи, волос и суставов",
    productReferenceNotes: null,
    hasProductReference: true,
  });
  assert.equal(irrelevantPolicy.mode, "full_reference", "a different product category must retain the useful source setup");
  assert.equal(irrelevantPolicy.decisions.environment, "preserve");
  assert.equal(irrelevantPolicy.decisions.sourceProduct, "replace_with_product");
  assert.equal(irrelevantPolicy.decisions.sourceProps, "preserve_as_support");
  const foodBeat = buildReferenceTransferFramePlan({
    policy: irrelevantPolicy,
    productName: "Апельсиновый коллаген",
    spokenText: "Для быстрого перекуса я беру овощи и воду в дорогу.",
    visualCue: "показывает контейнер с овощами на пассажирском сиденье",
  });
  assert.equal(foodBeat.productMeaningfulBeat, false);
  assert.equal(foodBeat.decisions.sourceProduct, "remove");
  assert.equal(foodBeat.decisions.sourceProps, "preserve_as_support");
  assert.match(
    resolveReferenceTransferAction({
      framePlan: foodBeat,
      referenceAction: "показывает исходную банку в машине",
      fallbackAction: "показывает контейнер с овощами на пассажирском сиденье",
    }),
    /контейнер с овощами/iu
  );
  const collagenBeat = buildReferenceTransferFramePlan({
    policy: irrelevantPolicy,
    productName: "Апельсиновый коллаген",
    spokenText: "Коллаген удобно пить утром перед выходом.",
    visualCue: "держит наш коллаген у камеры",
  });
  assert.equal(collagenBeat.productMeaningfulBeat, true);
  assert.equal(collagenBeat.decisions.sourceProduct, "replace_with_product");
  assert.match(
    resolveReferenceTransferAction({
      framePlan: collagenBeat,
      referenceAction: "показывает исходную банку в машине",
      fallbackAction: "держит наш коллаген у камеры",
    }),
    /исходный рекламный предмет заменен нашим продуктом/iu
  );
  assert.match(
    resolveReferenceTransferAction({
      framePlan: { ...collagenBeat, visualCue: null, requiredReferenceAction: "держит руки на поясе" },
      referenceAction: "держит руки на поясе",
      fallbackAction: "берет банку со стола и поднимает к камере",
    }),
    /берет банку со стола/iu,
    "the planned frame action must take priority over a literal reference gesture"
  );
  const unsafeActionBeat = buildReferenceTransferFramePlan({
    policy: buildReferenceTransferPolicy({
      hasProductReference: true,
      directorBrief: {
        visual_transfer: {
          camera_composition: "close-up in a car",
          props: [],
          action_beats: [{ timestamp_sec: 0, action: "liquid pours from a stick pack at her lips into mouth" }],
        },
      },
    }),
    productName: "Апельсиновый коллаген",
    spokenText: "Коллаген удобно взять с собой.",
    productVisible: true,
  });
  assert.equal(unsafeActionBeat.requiredReferenceAction, null);
  assert.doesNotMatch(
    resolveReferenceTransferAction({
      framePlan: unsafeActionBeat,
      referenceAction: "liquid pours from a stick pack at her lips into mouth",
      fallbackAction: "герой держит коллаген у камеры",
    }),
    /mouth|lips|liquid/iu
  );
  const productPackageBrief = normalizeDirectorBrief({
    director_brief: {
      ...brief,
      visual_transfer: {
        camera_composition: "close-up with a product box at the lower edge",
        props: [
          { role: "source_product", description: "pink and white product box held low by the presenter", visible_from_start: true },
          { role: "support_prop", description: "food container on the passenger seat", visible_from_start: true },
        ],
        action_beats: [
          { timestamp_sec: 0, action: "holds the product box low while speaking", required_prop: "pink and white product box" },
          { timestamp_sec: 5, action: "shows the food container", required_prop: "food container" },
        ],
      },
    },
  });
  assert.ok(productPackageBrief);
  const productPackagePolicy = buildReferenceTransferPolicy({ hasProductReference: true, directorBrief: productPackageBrief });
  const neutralFoodBeat = buildReferenceTransferFramePlan({
    policy: productPackagePolicy,
    productName: "Апельсиновый коллаген",
    spokenText: "В дорогу беру овощи и воду.",
    position: 1,
  });
  assert.ok(neutralFoodBeat.requiredSupportProps.includes("food container on the passenger seat"));
  assert.ok(neutralFoodBeat.requiredSupportProps.includes("food container"));
  assert.ok(!neutralFoodBeat.requiredSupportProps.some((prop) => /product box/iu.test(prop)));
  assert.equal(neutralFoodBeat.requiredReferenceAction, "shows the food container");
  const splitPackageBrief = normalizeDirectorBrief({
    director_brief: {
      ...brief,
      visual_transfer: {
        camera_composition: "close-up with hands and product package in the lower frame",
        props: [
          { role: "source_product", description: "red collagen stick pack and branded product box", visible_from_start: true },
          { role: "support_prop", description: "phone on the table", visible_from_start: true },
        ],
        action_beats: [
          { timestamp_sec: 0, action: "holds two red collagen stick packs", required_prop: "two red collagen stick packs" },
          { timestamp_sec: 5, action: "shows the red product box", required_prop: "red product box and stick pack" },
          { timestamp_sec: 9, action: "uses the phone", required_prop: "phone on the table" },
        ],
      },
    },
  });
  assert.ok(splitPackageBrief);
  const splitPackagePolicy = buildReferenceTransferPolicy({ hasProductReference: true, directorBrief: splitPackageBrief });
  const hiddenSourceProductBeat = buildReferenceTransferFramePlan({
    policy: splitPackagePolicy,
    productName: "Апельсиновый коллаген",
    spokenText: "Объясняю, как выбрать подходящий продукт.",
    productVisible: false,
    position: 0,
  });
  assert.deepEqual(hiddenSourceProductBeat.requiredSupportProps, ["phone on the table"]);
  assert.equal(hiddenSourceProductBeat.requiredReferenceAction, null);
  const replacementSourceProductBeat = buildReferenceTransferFramePlan({
    policy: splitPackagePolicy,
    productName: "Апельсиновый коллаген",
    spokenText: "Показываю свой коллаген.",
    productVisible: true,
    position: 0.5,
  });
  assert.deepEqual(replacementSourceProductBeat.requiredSupportProps, ["phone on the table"]);
  assert.match(replacementSourceProductBeat.requiredReferenceAction, /продуктом клиента/iu);
  const wardrobePropPolicy = buildReferenceTransferPolicy({
    hasProductReference: true,
    directorBrief: normalizeDirectorBrief({
      director_brief: {
        ...brief,
        visual_transfer: {
          camera_composition: "chef at a steel worktable",
          props: [
            { role: "support_prop", description: "white short-sleeve chef coat with mandarin collar", visible_from_start: true },
            { role: "proof_prop", description: "silver watch and ring", visible_from_start: true },
            { role: "support_prop", description: "steel worktable", visible_from_start: true },
          ],
          action_beats: [{ timestamp_sec: 0, action: "speaks to camera", required_prop: "white chef coat" }],
        },
      },
    }),
  });
  const wardrobePropFrame = buildReferenceTransferFramePlan({
    policy: wardrobePropPolicy,
    productName: "Апельсиновый коллаген",
    spokenText: "Объясняю выбор",
    productVisible: false,
  });
  assert.deepEqual(wardrobePropFrame.requiredSupportProps, ["steel worktable"]);
  assert.equal(wardrobePropFrame.requiredReferenceAction, "speaks to camera");
  const referencePrompt = renderSimpleFullBodyUgcPrompt({
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
  assert.ok(referencePrompt.includes("small kitchen"), "reference environment must remain available to the prompt");

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OMNI_DIRECTOR_ANALYSIS_MODEL = "minimax/minimax-m3";
  let requestPayload = null;
  let requestSignal = null;
  global.fetch = async (url, init = {}) => {
    if (String(url).includes("/api/v1/model/")) {
      return {
        ok: true,
        json: async () => ({ data: { pricing: { prompt: "0.000001", completion: "0.000002" } } }),
      };
    }
    requestSignal = init.signal;
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
  assert.ok(requestSignal, "director analysis request must have a timeout signal");
  assert.equal(requestSignal.aborted, false);
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
