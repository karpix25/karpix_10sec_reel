import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire, Module } from "node:module";

const ui = resolve(import.meta.dirname, "../ui");
const output = mkdtempSync(join(tmpdir(), "omni-submit-snapshot-"));
const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const originalFetch = global.fetch;
const savedAudioEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => /^KIE_(?:OMNI_)?(?:(?:MALE|FEMALE)_)?AUDIO_IDS?$/u.test(key)));
const avatarUrl = "https://example.com/pinned-avatar.png";
const avatarRows = [
  { id: 17, project_id: 7, reference_url: avatarUrl, kie_character_id: "pinned-character", speech_gender: "male", kie_character_payload: { audio_ids: ["pinned-voice"] } },
  { id: 99, project_id: 7, reference_url: "https://example.com/latest-avatar.png", kie_character_id: "wrong-latest-character", speech_gender: "female", kie_character_payload: { audio_ids: ["wrong-latest-voice"] } },
];
let reel, segments, tasks, avatarQueries, payloads, preflightFailures, avatarMissing, scriptError;
const db = { query: async (sql, args) => {
  if (/SELECT status, script, source_snapshot/.test(sql)) {
    assert.deepEqual(args, [9, 7, 8]);
    return { rows: [{ status: "draft", script: "Checked text.", source_snapshot: { generation_error: scriptError } }] };
  }
  if (/SELECT \* FROM omni_reels/.test(sql)) { assert.deepEqual(args, [41]); return { rows: [reel] }; }
  if (/SELECT \*\s+FROM omni_reel_segments/.test(sql)) { assert.deepEqual(args, [41]); return { rows: segments }; }
  if (/FROM omni_client_avatars/.test(sql)) {
    assert.match(sql, /WHERE id = \$1 AND project_id = \$2 AND reference_url = \$3/);
    assert.doesNotMatch(sql, /ORDER BY|created_at DESC/);
    assert.deepEqual(args, [17, 7, avatarUrl], "fallback must query the exact saved avatar and image");
    avatarQueries.push(args);
    return { rows: avatarMissing ? [] : avatarRows.filter((row) => row.id === args[0] && row.project_id === args[1] && row.reference_url === args[2]) };
  }
  if (/UPDATE omni_reels/.test(sql)) { reel.status = "generating"; return { rowCount: 1 }; }
  if (/SET generation_provider = \$2/.test(sql)) {
    for (const segment of segments) if (segment.status === "draft") segment.generation_provider = args[1];
    return { rowCount: segments.length };
  }
  if (/SET kie_task_id = \$2/.test(sql)) {
    const segment = segments.find((item) => item.id === args[0]);
    assert.ok(segment);
    segment.kie_task_id = args[1]; segment.status = args[2]; segment.generation_provider = args[5];
    payloads.push(JSON.parse(args[3]));
    return { rowCount: 1 };
  }
  throw new Error(`Unexpected mocked SQL: ${sql}`);
} };

try {
  global.fetch = async () => { throw new Error("Network is forbidden in submit snapshot regression"); };
  for (const key of Object.keys(savedAudioEnv)) delete process.env[key];
  const config = join(output, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022", module: "commonjs", moduleResolution: "node", strict: true,
      rootDir: join(ui, "src"), outDir: output, baseUrl: join(ui, "src"), paths: { "@/*": ["*"] },
      esModuleInterop: true, skipLibCheck: true, types: ["node"], typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [
      join(ui, "src/lib/server/omni/omni-reel-runner.ts"),
      join(ui, "src/app/api/omni/reels/[reelId]/run/route.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const pure = (name) => require(join(output, `lib/server/omni/${name}.js`));
  const provider = require(join(output, "lib/omni/provider.js"));
  const mocks = new Map([
    ["@/lib/db", db], ["@/lib/omni/provider", provider],
    ...["omni-reference-images", "omni-product-reference-images", "kie-omni-audio", "omni-intro-product-contract", "omni-reference-scene-mode", "omni-reference-format-mode", "omni-continuity-prompt", "storyboard/omni-storyboard-file-reference"]
      .map((name) => [`./${name}`, pure(name)]),
    ["./schema", { ensureOmniSchema: async () => {} }],
    ["./comet-video-client", { getCometReferenceImageFieldName: () => "image_urls", getCometReferenceImageTransport: () => "url", shouldSendCometReferenceImage: () => false }],
    ["./omni-composite-reference", { createOmniCompositeReference: unexpected("composite generation") }],
    ["./omni-continuity-reference", { isOmniContinuityChainEnabled: () => false, isSegmentBlockedByContinuityChain: () => false, resolveContinuityReference: unexpected("continuity media lookup") }],
    ["./omni-provider-tasks", { getProviderDuration: (_provider, seconds) => seconds }],
    ["./omni-video-task-dispatch", { createOmniVideoTask: async (input) => {
      tasks.push(input);
      return { id: `mock-task-${tasks.length}`, status: "queued", raw: { mocked: true } };
    } }],
    ["./omni-reel-subtitles", { processOmniReelSubtitlesIfNeeded: unexpected("subtitles") }],
    ["./omni-segment-completion", { stitchAndStoreReel: unexpected("video stitching") }],
    ["./omni-segment-sync", { syncOmniReelSegments: unexpected("provider polling") }],
    ["./omni-physical-preflight", { assertOmniPhysicalPreflight: async ({ reelId, segments }) => { assert.equal(reelId, 41); assert.equal(segments.length, 2); } }],
    ["./omni-generation-costs", { recordKieGenerationCost: async () => {} }],
    ["./omni-reel-execution-lock", { withOmniReelExecutionLock: async (_id, { run }) => run() }],
    ["./director-analysis-types", { extractDirectorBriefFromSnapshot: (snapshot) => snapshot.director_analysis }],
    ["./omni-reel-preflight-failure", { getSkippedReferenceReason: () => "not-visible", markOmniReelPreflightFailure: async (input) => { preflightFailures.push(input); } }],
  ]);
  Module._load = function (name, parent, isMain) {
    if (mocks.has(name)) return mocks.get(name);
    if (name === "./generated-script-readiness") return originalLoad.call(this, join(output, "lib/server/omni/generated-script-readiness.js"), parent, isMain);
    if (name.startsWith("@/") || name.startsWith("./") || name.startsWith("../")) throw new Error(`Unexpected application dependency: ${name}`);
    return originalLoad.call(this, name, parent, isMain);
  };
  const runner = require(join(output, "lib/server/omni/omni-reel-runner.js"));

  reset();
  scriptError = "Unresolved script error";
  await assert.rejects(runner.submitOmniReel(41), /требует исправления/);
  assert.equal(tasks.length, 0, "editable failed draft must not dispatch a paid video task");
  assert.equal(avatarQueries.length, 0);
  reset();
  await runner.submitOmniReel(41);
  assert.equal(tasks.length, 2);
  assert.equal(avatarQueries.length, 2, "character and audio fallbacks both query the pinned identity once before the loop");
  for (const task of tasks) {
    assert.equal(task.provider, "kie-ai", "missing provider must preserve the stored provider");
    assert.equal(task.avatarFreeReferenceScene, false, "saved presenter production mode must override the raw hands-only source");
    assert.equal(task.characterId, "pinned-character");
    assert.deepEqual(task.audioIds, ["pinned-voice"]);
    assert.ok(task.imageUrls.includes("https://example.com/product.png"));
    assert.ok(!task.imageUrls.includes(avatarUrl), "KIE avatar must be a character ID, not another image reference");
  }
  assert.ok(payloads.every((payload) => payload.generation_provider === "kie-ai" && payload.reference_images_source.avatar_url === avatarUrl));
  await runner.submitOmniReel(41);
  assert.equal(tasks.length, 2, "submitted segments must not be paid for again");

  reset();
  reel.avatar_snapshot.kie_character_id = "snapshot-character";
  reel.avatar_snapshot.audio_ids = ["snapshot-voice"];
  await runner.submitOmniReel(41);
  assert.equal(avatarQueries.length, 1, "a saved character ID must not be replaced by a fresh avatar lookup");
  assert.ok(tasks.every((task) => task.characterId === "snapshot-character" && task.audioIds[0] === "snapshot-voice"));

  reset();
  await runner.submitOmniReel(41, "cometapi");
  assert.ok(tasks.every((task) => task.provider === "cometapi" && task.characterId === null));

  reset();
  avatarMissing = true;
  await assert.rejects(runner.submitOmniReel(41), /approved avatar/);
  assert.equal(tasks.length, 0, "a missing pinned identity must fail before paid submission; never substitute latest avatar");
  assert.equal(preflightFailures.length, 1);

  reset();
  reel.creative_strategy = {};
  await runner.submitOmniReel(41);
  assert.ok(tasks.every((task) => task.avatarFreeReferenceScene && task.characterId === null), "legacy faceless fallback remains valid when no production override exists");

  mocks.set("@/lib/server/omni/omni-reel-runner", runner);
  mocks.set("next/server", { NextResponse: { json: (body) => Response.json(body) } });
  mocks.set("@/lib/server/omni/http", {
    requireOmniUser: async () => ({}), parsePositiveInt: (value) => Number(value) > 0 ? Number(value) : null,
    jsonError: (error, status = 400) => Response.json({ error }, { status }),
  });
  const route = require(join(output, "app/api/omni/reels/[reelId]/run/route.js"));
  reset();
  const response = await route.POST(new Request("https://example.com/api/omni/reels/41/run", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  }), { params: Promise.resolve({ reelId: "41" }) });
  assert.equal(response.status, 200);
  assert.ok(tasks.every((task) => task.provider === "kie-ai"), "run route must not coerce an omitted provider into Comet before the runner sees it");
  console.log("Omni reel submit snapshot checks passed (mocked DB/dispatch/route; no network or paid tasks)");
} finally {
  Module._load = originalLoad;
  global.fetch = originalFetch;
  Object.assign(process.env, savedAudioEnv);
  rmSync(output, { recursive: true, force: true });
}

function reset() {
  reel = {
    id: 41, project_id: 7, product_id: 8, status: "draft", source_generated_script_id: 9,
    avatar_snapshot: { id: 17, reference_url: avatarUrl, speech_gender: "male" },
    product_snapshot: { name: "Коллаген", product_refs: [{ kind: "image", url: "https://example.com/product.png" }] },
    creative_strategy: { referenceSceneMode: "presenter" },
    source_snapshot: { director_analysis: { reference_subject_mode: "faceless_hands", visible_subject_policy: "hands_only", reference_format_mode: "voiceover_montage" } },
  };
  segments = [1, 2].map((index) => ({
    id: 100 + index, reel_id: 41, segment_index: index, status: "draft", kie_task_id: null,
    generation_provider: "kie-ai", duration_seconds: 4, prompt: "Точная реплика для сохранённого аватара",
    storyboard_reference_url: `https://example.com/storyboard-${index}.png`,
    creative_plan: { productRole: "brief_demo" },
    storyboard_plan: { frames: [{ productPlacement: "Коллаген на столе" }] },
  }));
  tasks = []; avatarQueries = []; payloads = []; preflightFailures = []; avatarMissing = false; scriptError = null;
}

function unexpected(operation) {
  return async () => { throw new Error(`Unexpected ${operation} in local regression`); };
}
