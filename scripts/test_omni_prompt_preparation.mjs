import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire, Module } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-prompt-preparation-"));
const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const originalFetch = global.fetch;
const counters = { build: 0, physical: 0, semantic: 0, release: 0, reads: 0, writes: 0 };
let saved = null;
let held = false;
let allowSave = true;
let physicalGate = null;
let rejectSemantic = false;
const sqlCalls = [];
const script = "Сначала выбираем состав спокойно. Потом рассматриваем нашу упаковку.";
const directorBrief = { camera_timeline: [{ start_sec: 0, end_sec: 4, visual_description: "presenter and product" }], wardrobe_continuity: "stable" };
const input = {
  projectId: 1, productId: 2,
  generatedScript: { id: 3, status: "draft", script, source_snapshot: { director: directorBrief }, source_legacy_client_id: 4 },
  product: { name: "Коллаген", description: "Состав", product_refs: [{ kind: "image", url: "https://example.com/product.png" }], cta_mode: "no_explicit_cta", cta_value: null },
  avatar: { id: 5, reference_url: "https://example.com/avatar.png", prompt: "ведущий", speech_gender: "male", kie_character_id: "avatar-5" },
  directorBrief, segmentCount: 1, segmentSeconds: 10,
  timedVoiceoverPlan: { script, segmentCount: 1, durationSeconds: 4, segments: [{ index: 1, text: script, durationSeconds: 4 }] },
  targetAudience: "взрослые", wardrobeSource: "reference", ctaMode: "no_explicit_cta", ctaValue: null,
  referenceSourceDurationSeconds: 4, brief: null, legacyTranscript: null,
};
const frames = [
  { speechMode: "on_camera", spokenText: "Сначала выбираем состав спокойно.", visualAction: "аватар говорит", productPlacement: "продукт вне кадра" },
  { speechMode: "voiceover_only", spokenText: "Потом рассматриваем нашу упаковку.", visualAction: "продукт на столе", productPlacement: "Коллаген на столе" },
];
const plan = [{
  index: 1, role: "hook", durationSeconds: 4, voiceoverText: script, prompt: script,
  creativeStrategy: {}, creativePlan: { productRole: "background_prop", voiceoverText: script },
  storyboardPlan: { segmentIndex: 1, durationSeconds: 4, voiceoverText: script, frames },
  storyboardValidation: { valid: true }, validation: { valid: true, errors: [], warnings: [] }, referenceUrl: null,
}];
const db = {
  query: async (sql, args) => {
    assert.equal(held, false, "a preparation holding a pooled client must reuse it for cache reads");
    return readRow(sql, args);
  },
  connect: async () => ({
    query: async (sql, args) => {
      sqlCalls.push({ sql, args });
      if (/pg_try_advisory_lock/.test(sql)) {
        const locked = !held;
        if (locked) held = true;
        return { rows: [{ locked }] };
      }
      if (/pg_advisory_unlock/.test(sql)) { held = false; return { rows: [] }; }
      if (/SELECT status, script, source_snapshot/.test(sql)) return { rows: [input.generatedScript] };
      if (/SELECT prepared_prompt_plan/.test(sql)) return readRow(sql, args);
      assert.match(sql, /UPDATE omni_generated_scripts/);
      assert.deepEqual(args.slice(0, 3), [3, 1, 2]);
      assert.match(sql, /AND script = \$5/);
      assert.equal(args[4], script);
      if (!allowSave) return { rowCount: 0 };
      counters.writes += 1;
      saved = JSON.parse(args[3]);
      return { rowCount: 1 };
    },
    release: () => { counters.release += 1; },
  }),
};

try {
  global.fetch = async () => { throw new Error("Unexpected network access in local preparation regression"); };
  const config = join(output, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022", module: "commonjs", moduleResolution: "node", jsx: "react-jsx",
      rootDir: join(ui, "src"), outDir: output, baseUrl: join(ui, "src"), paths: { "@/*": ["*"] },
      strict: true, esModuleInterop: true, skipLibCheck: true,
      types: ["node"], typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [
      join(ui, "src/lib/server/omni/omni-prompt-preparation.ts"),
      join(ui, "src/lib/server/omni/generated-script-prompt-preparation.ts"),
      join(ui, "src/app/api/omni/generated-scripts/[scriptId]/prompts/route.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const avatarAdaptation = require(join(output, "lib/server/omni/omni-avatar-reel-plan.js"));
  const mocks = new Map([
    ["@/lib/db", db],
    ["./omni-avatar-reel-plan", avatarAdaptation],
    ["./omni-prompt-builder", { buildOmniSegmentPrompts: () => { counters.build += 1; return structuredClone(plan); } }],
    ["./omni-physical-repair-pipeline", { repairOmniPromptPlanWithAi: async ({ promptPlan }) => {
      counters.physical += 1;
      if (physicalGate) await physicalGate();
      return promptPlan;
    } }],
    ["./omni-storyboard-semantic-repair", { prepareOmniPromptPlanWithSemanticRepair: async ({ promptPlan }) => {
      counters.semantic += 1;
      if (rejectSemantic) throw new Error("Mock semantic failure");
      return promptPlan;
    } }],
    ["./physical-scene-validator", { assertPhysicalPromptPlan: (value) => {
      assert.ok(Array.isArray(value));
      if (value.some((segment) => !segment.validation.valid)) throw new Error("Invalid physical plan");
    } }],
    ["./storyboard/storyboard-contract-validator", { assertStoryboardPromptContracts: (value, productName) => {
      assert.ok(Array.isArray(value)); assert.equal(productName, input.product.name);
    } }],
    ["./storyboard/omni-storyboard-renderer", { renderCompactRussianOmniStoryboardPrompt: ({ storyboard }) => storyboard.voiceoverText }],
    ["../../omni/storyboard/omni-storyboard-contract", { validateOmniStoryboardSegment: () => ({ valid: true }) }],
    ["./omni-reference-scene-mode", { resolveReferenceSceneMode: () => "presenter" }],
    ["./omni-reference-format-mode", { resolveReferenceFormatMode: () => "continuous_story" }],
    ["./omni-reference-transfer-policy", { hasCompleteSourceTimeline: (brief) => Boolean(brief?.camera_timeline?.length) }],
    ["./omni-product-reference-images", { resolveProductReferenceImageUrls: (product) => product.product_refs?.map((ref) => ref.url) || [] }],
    ["./omni-prompt-validator", { validatePromptVoiceoverIsolation: () => [], validateVoiceoverSequence: (text, segments) => text === segments.map((segment) => segment.voiceoverText).join(" ") }],
  ]);
  Module._load = function (request, parent, isMain) {
    if (mocks.has(request)) return mocks.get(request);
    if (request === "./generated-script-readiness") return originalLoad.call(this, join(output, "lib/server/omni/generated-script-readiness.js"), parent, isMain);
    if (request.startsWith("@/") || request.startsWith("./") || request.startsWith("../")) {
      throw new Error(`Unexpected unstubbed application dependency: ${request}`);
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const prepared = require(join(output, "lib/server/omni/omni-prompt-preparation.js"));
  const signature = prepared.buildOmniPromptPreparationSignature;
  const originalSignature = signature(input);
  assert.equal(signature({ ...input, directorBrief: avatarAdaptation.adaptDirectorBriefForAvatarReel(input.directorBrief) }), originalSignature,
    "raw and already adapted reference contexts must reuse the same prepared plan");
  assert.equal(signature(reverseObjectKeys(input)), originalSignature, "nested object key ordering must not invalidate a cache entry");
  for (const [path, value] of [
    ["generatedScript.script", "Изменённый сценарий"], ["product.name", "Другой продукт"],
    ["product.description", "Другой состав"], ["product.product_refs.0.url", "https://example.com/new-product.png"],
    ["product.product_physical_contract", { form: "bottle", support: "table" }],
    ["product.product_visual_profile", { packaging: "white box" }],
    ["avatar.id", 6], ["avatar.reference_url", "https://example.com/new-avatar.png"], ["avatar.kie_character_id", "avatar-6"],
    ["avatar.prompt", "другой образ"], ["avatar.speech_gender", "female"],
    ["generatedScript.source_snapshot.director.camera_timeline.0.visual_description", "новый референс"],
    ["generatedScript.source_snapshot.reference_id", 8],
    ["directorBrief.wardrobe_continuity", "changes"], ["segmentSeconds", 8], ["segmentCount", 2],
    ["segmentDurationsSeconds", [6]], ["voiceSegments", [{ index: 1, text: "Другая разбивка речи", wordCount: 3 }]],
    ["timedVoiceoverPlan.durationSeconds", 6], ["referenceSourceDurationSeconds", 12], ["ctaValue", "код"],
  ]) {
    const changed = structuredClone(input);
    const parts = path.split(".");
    const owner = parts.slice(0, -1).reduce((object, key) => object[key], changed);
    owner[parts.at(-1)] = value;
    assert.notEqual(signature(changed), originalSignature, `${path} must invalidate the prepared plan`);
  }
  assert.equal(signature({ ...input, recentFormatIds: ["grwm"] }), originalSignature,
    "unrelated reel history must not invalidate an already prepared visual choice");
  assert.equal(await prepared.readPreparedOmniPromptPlan(input), null);
  assert.equal(counters.build, 0, "cache read must not build or repair a plan");
  await assert.rejects(prepared.prepareOmniPromptPlan({ ...input, avatar: null }), /аватар/);
  await assert.rejects(prepared.prepareOmniPromptPlan({ ...input, product: { ...input.product, product_refs: [] } }), /изображение продукта/);
  await assert.rejects(prepared.prepareOmniPromptPlan({ ...input, directorBrief: null }), /таймлайн/);
  await assert.rejects(prepared.prepareOmniPromptPlan({ ...input, referenceSourceDurationSeconds: 15 }), /не покрывает/);
  assert.equal(counters.build, 0, "invalid inputs must fail before generation or repair");
  await assert.rejects(prepared.prepareOmniPromptPlan({ ...input, generatedScript: { ...input.generatedScript,
    source_snapshot: { generation_error: "Unresolved script error" },
  } }), /требует исправления/);
  assert.equal(counters.build, 0, "failed editable drafts must not enter paid preparation");
  await prepared.prepareOmniPromptPlan(input);
  assert.equal(counters.build, 1);
  assert.equal(counters.physical, 1);
  assert.equal(counters.semantic, 1);
  await prepared.prepareOmniPromptPlan(input);
  await prepared.readPreparedOmniPromptPlan(input);
  assert.equal(counters.build, 1, "repeated preparation must reuse the saved plan");
  assert.equal(counters.physical, 1);
  assert.equal(counters.semantic, 1);
  assert.equal(prepared.readMatchingPreparedOmniPromptPlan({ ...saved, version: "outdated" }, originalSignature), null);

  saved = null;
  let markEntered, resume;
  const entered = new Promise((resolve) => { markEntered = resolve; });
  const paused = new Promise((resolve) => { resume = resolve; });
  physicalGate = async () => { markEntered(); await paused; };
  const first = prepared.prepareOmniPromptPlan(input);
  await entered;
  await assert.rejects(prepared.prepareOmniPromptPlan(input), /уже готовится/);
  assert.equal(counters.physical, 2, "concurrent preparation must not enter paid repair twice");
  assert.equal(held, true, "the rejected second request must not unlock the active first request");
  resume();
  await first;
  physicalGate = null;
  assert.equal(held, false);

  saved = null;
  rejectSemantic = true;
  await assert.rejects(prepared.prepareOmniPromptPlan(input), /Mock semantic failure/);
  assert.equal(held, false, "failure must release the advisory lock");
  rejectSemantic = false;
  allowSave = false;
  await assert.rejects(prepared.prepareOmniPromptPlan(input), /Сценарий изменился/);
  assert.equal(held, false);
  allowSave = true;

  mocks.set("./omni-prompt-preparation", prepared);
  mocks.set("./generated-scripts", { getGeneratedScript: async () => input.generatedScript });
  mocks.set("./products", { requireOmniProductInProject: async () => input.product });
  mocks.set("./projects", { getOmniProject: async () => ({ target_audience: input.targetAudience, wardrobe_source: input.wardrobeSource }) });
  mocks.set("./avatars", { getLatestOmniClientAvatar: async () => input.avatar });
  mocks.set("./omni-duration-settings", { resolveOmniDurationRange: async () => ({ minSeconds: 4, maxSeconds: 10 }) });
  mocks.set("./omni-timed-voiceover-plan", { resolveOmniTimedVoiceoverPlan: () => input.timedVoiceoverPlan });
  mocks.set("./omni-duration-planner", { OMNI_SEGMENT_SECONDS: 10 });
  mocks.set("./director-analysis-types", { extractDirectorBriefFromSnapshot: () => directorBrief });
  mocks.set("./storyboard-reference-frame-timing", { readSourceDurationSeconds: () => 4 });
  const adapter = require(join(output, "lib/server/omni/generated-script-prompt-preparation.js"));
  mocks.set("@/lib/server/omni/generated-script-prompt-preparation", adapter);
  mocks.set("next/server", { NextResponse: { json: (body) => Response.json(body) } });
  mocks.set("@/lib/omni/provider", { normalizeOmniGenerationProvider: () => "kie-ai" });
  mocks.set("@/lib/server/omni/http", {
    requireOmniUser: async () => ({}), parsePositiveInt: (value) => /^\d+$/.test(value || "") && Number(value) > 0 ? Number(value) : null,
    getOmniErrorStatus: () => 400, jsonError: (error, status = 400) => Response.json({ error }, { status }),
  });
  const route = require(join(output, "app/api/omni/generated-scripts/[scriptId]/prompts/route.js"));
  const context = { params: Promise.resolve({ scriptId: "3" }) };
  const url = "https://example.com/api/omni/generated-scripts/3/prompts?projectId=1&productId=2";
  const beforeGet = { ...counters };
  assert.deepEqual(await (await route.GET(new Request(url), context)).json(), []);
  assert.equal(counters.physical, beforeGet.physical, "GET without preparation must stay read-only");
  const response = await route.POST(new Request(url, { method: "POST" }), context);
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.equal(preview.length, 1);
  assert.equal(preview[0].storyboardReferenceUrl, null, "prompt-only preview must not attach images from an unverified preparation");
  const paidAfterPost = { physical: counters.physical, semantic: counters.semantic };
  assert.deepEqual(await (await route.GET(new Request(url), context)).json(), preview);
  await route.POST(new Request(url, { method: "POST" }), context);
  assert.deepEqual({ physical: counters.physical, semantic: counters.semantic }, paidAfterPost, "GET and cached POST must not repeat paid repairs");
  assert.equal((await route.GET(new Request("https://example.com/prompts"), context)).status, 400);
  assert.equal(held, false);
  assert.ok(sqlCalls.some(({ sql }) => /status IN \('draft', 'approved'\)/.test(sql)));
  console.log("Omni prompt preparation checks passed (mocked DB, repairs and routes; no network)");
} finally {
  Module._load = originalLoad;
  global.fetch = originalFetch;
  rmSync(output, { recursive: true, force: true });
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  return value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseObjectKeys(item)]))
    : value;
}

function readRow(sql, args) {
  sqlCalls.push({ sql, args });
  assert.match(sql, /SELECT prepared_prompt_plan/);
  assert.deepEqual(args, [3, 1, 2], "reads must remain scoped to this script/product/project");
  counters.reads += 1;
  return { rows: [{ prepared_prompt_plan: saved }] };
}
