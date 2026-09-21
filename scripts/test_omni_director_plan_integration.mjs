import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-director-plan-integration-"));
const dist = join(output, "dist");
const require = createRequire(import.meta.url);

try {
  writeFileSync(
    join(output, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        skipLibCheck: true,
        strict: true,
        esModuleInterop: true,
        module: "commonjs",
        moduleResolution: "node",
        resolveJsonModule: true,
        isolatedModules: false,
        incremental: false,
        outDir: "dist",
        baseUrl: ui,
        paths: { "@/*": ["src/*"] },
      },
      include: [
        join(ui, "src/lib/server/omni/omni-director-plan-integration.ts"),
        join(ui, "src/lib/server/omni/omni-script-director.ts"),
      ],
    })
  );
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["-p", join(output, "tsconfig.json")], {
    cwd: ui,
    stdio: "inherit",
  });

  const dbStubPath = join(output, "db-stub.js");
  writeFileSync(
    dbStubPath,
    'module.exports = { query: async () => { throw new Error("DB forbidden in director plan integration test"); }, connect: async () => { throw new Error("DB forbidden in director plan integration test"); } };'
  );
  const nodeModule = require("node:module");
  const originalResolveFilename = nodeModule._resolveFilename;
  nodeModule._resolveFilename = function (request, ...args) {
    if (request === "@/lib/db") return dbStubPath;
    return originalResolveFilename.call(this, request, ...args);
  };
  let integrationModule, directorModule;
  try {
    integrationModule = require(findFile(dist, "omni-director-plan-integration.js"));
    directorModule = require(findFile(dist, "omni-script-director.js"));
  } finally {
    nodeModule._resolveFilename = originalResolveFilename;
  }

  const { deriveSegmentTimeWindows, mapDirectorScenesToSegments, renderDirectorScenesPromptSection } = integrationModule;

  // The lazy wiring target must exist on the director module.
  assert.equal(typeof directorModule.getScriptDirectorPlan, "function", "getScriptDirectorPlan is exported");

  const makeScene = (overrides) => ({
    scene_index: 1,
    start_sec: 0,
    end_sec: 6,
    purpose: "крючок",
    visual_description: "крупный план лица в утреннем свете у окна",
    product_visible: false,
    product_action: null,
    speech_excerpt: "почему крем сушит кожу",
    ...overrides,
  });

  // ---- 30s reel, 3 segments of 10s, 4 director scenes ----
  const segments = [1, 2, 3].map((index) => ({
    segment_index: index,
    voiceover_text: null,
    duration_seconds: 10,
  }));
  const windows = deriveSegmentTimeWindows(segments);
  assert.deepEqual(
    windows.map((window) => [window.start_sec, window.end_sec]),
    [[0, 10], [10, 20], [20, 30]],
    "explicit durations build contiguous windows"
  );

  const fourScenes = [
    makeScene({ scene_index: 1, start_sec: 0, end_sec: 6, purpose: "крючок", product_visible: false }),
    makeScene({ scene_index: 2, start_sec: 6, end_sec: 14, purpose: "решение", product_visible: true, product_action: "крем в руке" }),
    makeScene({ scene_index: 3, start_sec: 14, end_sec: 22, purpose: "демонстрация", product_visible: true, product_action: "флакон на полке" }),
    makeScene({ scene_index: 4, start_sec: 22, end_sec: 30, purpose: "призыв", product_visible: true, product_action: null }),
  ];
  const mapping = mapDirectorScenesToSegments({ segments, plan: { scenes: fourScenes } });
  // Midpoints 3, 10, 18, 26 map to segments 1, 2, 2, 3.
  assert.deepEqual(
    mapping.map((item) => item.director_scenes.map((scene) => scene.scene_index)),
    [[1], [2, 3], [4]],
    "scene midpoints map to the owning segment"
  );
  const assigned = mapping.flatMap((item) => item.director_scenes.map((scene) => scene.scene_index));
  assert.equal(assigned.length, 4, "every scene is assigned exactly once");
  assert.equal(new Set(assigned).size, 4, "no scene is assigned twice");
  assert.deepEqual(
    mapping.map((item) => item.product_visible),
    [false, true, true],
    "product_visible propagates from overlapping scenes"
  );

  // ---- a plan shorter than the reel leaves trailing segments empty ----
  const shortPlan = [
    makeScene({ scene_index: 1, start_sec: 0, end_sec: 12 }),
    makeScene({ scene_index: 2, start_sec: 12, end_sec: 20 }),
  ];
  const shortMapping = mapDirectorScenesToSegments({ segments, plan: { scenes: shortPlan } });
  assert.deepEqual(
    shortMapping.map((item) => item.director_scenes.length),
    [1, 1, 0],
    "trailing segment gets an empty director_scenes array"
  );
  assert.equal(shortMapping[2].product_visible, false, "empty segment is not product_visible");

  // ---- a plan longer than the segment timeline clamps into the last segment ----
  const longPlan = [
    makeScene({ scene_index: 1, start_sec: 0, end_sec: 8 }),
    makeScene({ scene_index: 2, start_sec: 8, end_sec: 16 }),
    makeScene({ scene_index: 3, start_sec: 16, end_sec: 24 }),
  ];
  const longMapping = mapDirectorScenesToSegments({
    segments: segments.slice(0, 2).map((segment) => ({ ...segment, duration_seconds: 10 })),
    plan: { scenes: longPlan },
  });
  assert.deepEqual(
    longMapping.map((item) => item.director_scenes.map((scene) => scene.scene_index)),
    [[1], [2, 3]],
    "overflowing midpoint clamps into the last segment instead of being dropped"
  );

  // ---- missing durations derive from voiceover word count at 2.2 words/sec ----
  const voiceover22Words = Array.from({ length: 22 }, (_, index) => `слово${index + 1}`).join(" ");
  const derivedSegments = [1, 2, 3].map((index) => ({
    segment_index: index,
    voiceover_text: voiceover22Words,
    duration_seconds: null,
  }));
  const derivedWindows = deriveSegmentTimeWindows(derivedSegments);
  assert.deepEqual(
    derivedWindows.map((window) => [window.start_sec, window.end_sec]),
    [[0, 10], [10, 20], [20, 30]],
    "22 words at 2.2 words/sec derive a 10s duration and stay contiguous"
  );
  const derivedMapping = mapDirectorScenesToSegments({
    segments: derivedSegments,
    plan: { scenes: [
      makeScene({ scene_index: 1, start_sec: 0, end_sec: 4 }),
      makeScene({ scene_index: 2, start_sec: 12, end_sec: 16 }),
      makeScene({ scene_index: 3, start_sec: 24, end_sec: 28 }),
    ] },
  });
  assert.deepEqual(
    derivedMapping.map((item) => item.director_scenes.map((scene) => scene.scene_index)),
    [[1], [2], [3]],
    "derived windows assign midpoints correctly"
  );

  // ---- planned_start_sec pins the window start ----
  const pinnedWindows = deriveSegmentTimeWindows([
    { segment_index: 1, voiceover_text: null, duration_seconds: 10, planned_start_sec: 0 },
    { segment_index: 2, voiceover_text: null, duration_seconds: 10, planned_start_sec: 10 },
    { segment_index: 3, voiceover_text: null, duration_seconds: 10, planned_start_sec: 20 },
  ]);
  assert.deepEqual(
    pinnedWindows.map((window) => [window.start_sec, window.end_sec]),
    [[0, 10], [10, 20], [20, 30]],
    "planned_start_sec values are honored"
  );

  // ---- prompt section rendering ----
  const section = renderDirectorScenesPromptSection({
    scenes: [fourScenes[1]],
    segment_start_sec: 10,
  });
  assert.ok(section.includes("РЕЖИССЁРСКАЯ РАСКАДРОВКА ЭТОГО СЕГМЕНТА"), "section header present");
  assert.ok(section.includes("РЕЖИССЁР: решение —"), "director line follows the purpose format");
  assert.ok(section.includes("крупный план лица в утреннем свете у окна"), "visual description rendered");
  assert.ok(section.includes("(0-4 с сегмента)"), "scene time is relative to the segment start");
  assert.ok(section.includes("ДЕЙСТВИЕ С ПРОДУКТОМ: крем в руке"), "product action line rendered");

  const noProductSection = renderDirectorScenesPromptSection({
    scenes: [fourScenes[0]],
    segment_start_sec: 0,
  });
  assert.ok(!noProductSection.includes("ДЕЙСТВИЕ С ПРОДУКТОМ"), "hidden product has no action line");
  const actionlessVisibleSection = renderDirectorScenesPromptSection({
    scenes: [fourScenes[3]],
    segment_start_sec: 20,
  });
  assert.ok(!actionlessVisibleSection.includes("ДЕЙСТВИЕ С ПРОДУКТОМ"), "visible product without action has no action line");
  assert.ok(!actionlessVisibleSection.includes("почему крем сушит кожу"), "speech excerpt never leaks into the prompt");

  // ---- scene text is sanitized (no long dashes or emoji) ----
  const sanitizedSection = renderDirectorScenesPromptSection({
    scenes: [makeScene({
      purpose: "крючок—с эмоцией 🎉",
      visual_description: "текст—с длинным тире и эмодзи 🎉 в описании кадра",
    })],
    segment_start_sec: 0,
  });
  assert.ok(!sanitizedSection.includes("🎉"), "emoji stripped from director text");
  assert.ok(sanitizedSection.includes("крючок с эмоцией"), "long dash in purpose replaced");
  assert.ok(sanitizedSection.includes("текст с длинным тире"), "long dash in visual description replaced");
  assert.equal(renderDirectorScenesPromptSection({ scenes: [], segment_start_sec: 0 }), null, "no scenes yields no section");

  console.log("Omni director plan integration checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: false })) {
    if (typeof entry === "string" && entry.endsWith(name)) {
      return join(dir, entry);
    }
  }
  throw new Error(`compiled file not found: ${name}`);
}
