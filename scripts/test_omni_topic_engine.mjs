import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-topic-engine-"));
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
        join(ui, "src/lib/server/omni/omni-topic-engine.ts"),
        join(ui, "src/lib/server/omni/omni-reference-materials.ts"),
        join(ui, "src/lib/server/omni/director-analysis-types.ts"),
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
    'module.exports = { query: async () => { throw new Error("DB forbidden in topic engine test"); }, connect: async () => { throw new Error("DB forbidden in topic engine test"); } };'
  );
  const nodeModule = require("node:module");
  const originalResolveFilename = nodeModule._resolveFilename;
  nodeModule._resolveFilename = function (request, ...args) {
    if (request === "@/lib/db") return dbStubPath;
    return originalResolveFilename.call(this, request, ...args);
  };
  let engineModule, materialsModule;
  try {
    engineModule = require(findFile(dist, "omni-topic-engine.js"));
    materialsModule = require(findFile(dist, "omni-reference-materials.js"));
  } finally {
    nodeModule._resolveFilename = originalResolveFilename;
  }

  // ---- views parsing from provider payloads ----
  const { extractViewsFromPayload, deriveReferenceMaterialDigest } = materialsModule;
  assert.equal(extractViewsFromPayload({ video_play_count: 123456 }), 123456, "root-level video_play_count");
  assert.equal(
    extractViewsFromPayload({ data: { xdt_shortcode_media: { video_view_count: "777000" } } }),
    777000,
    "nested data.xdt_shortcode_media.video_view_count parses numeric strings"
  );
  assert.equal(extractViewsFromPayload({ play_count: 500, view_count: 900 }), 900, "max across likely keys");
  assert.equal(
    extractViewsFromPayload({ data: { xdt_shortcode_media: { play_count: 42 } }, video_view_count: 40 }),
    42,
    "root and nested candidates compared together"
  );
  assert.equal(extractViewsFromPayload({ data: { xdt_shortcode_media: { likes: 5 } } }), null, "missing keys -> null");
  assert.equal(extractViewsFromPayload(null), null, "null payload -> null");
  assert.equal(extractViewsFromPayload("nope"), null, "non-object payload -> null");

  // The digest carries the parsed views from the analysis payload.
  const briefJson = {
    visual_hook: { action: "крупный план рук с флаконом", retention_trigger: "интрига до середины" },
    atmosphere: { mood: "спокойный", lighting: "мягкий", color_grading: "теплый", setting: "ванная" },
    clothing: { style: "домашний", color_palette: ["бежевый"], fit_details: "free", source: "reference" },
    camera: { shot_types: ["close-up"], angles: ["center"], movements: ["static"], stabilization: "штатив" },
    montage_rhythm: { cut_pace: "умеренный", beat_sync: "на акценты", transition_style: ["резкий"] },
    reusable_mechanics: { visual_mechanics: ["крупный план продукта в руке"], safe_zones_for_elements: "центр", looping_pattern: "нет" },
  };
  const digestWithViews = deriveReferenceMaterialDigest({
    director_analysis_status: "completed",
    director_analysis_json: briefJson,
    scrapecreators_payload: { data: { xdt_shortcode_media: { video_play_count: "15000" } } },
  });
  assert.ok(digestWithViews, "brief with views payload produces a digest");
  assert.equal(digestWithViews.views, 15000, "digest stores parsed views");
  assert.equal(
    deriveReferenceMaterialDigest({ director_analysis_json: briefJson }).views,
    null,
    "no payload -> null views"
  );

  // ---- proven layer ranking (pure) ----
  const { rankProvenMaterials, pickNextTopicsForProduct } = engineModule;
  assert.equal(typeof pickNextTopicsForProduct, "function", "engine exports the DB-facing picker");
  const provenMaterials = [
    { material_id: 1, topic: "тема про карты", core_concept: "дешёвые перелёты в Азию", conclusion: null, views: 50000, narrative_structure: [] },
    { material_id: 2, topic: "тема про жильё", core_concept: "бюджетное жильё на первой линии", conclusion: "Лангкави: жильё у моря за сто долларов", views: 200000, narrative_structure: [] },
    { material_id: 3, topic: "низкие просмотры", core_concept: "маленький референс без охвата", conclusion: null, views: 9000, narrative_structure: [] },
    { material_id: 4, topic: "дубль концепта", core_concept: "дешёвые перелёты в Азию", conclusion: null, views: 150000, narrative_structure: [] },
    { material_id: 5, topic: "без просмотров", core_concept: "референс без счётчика просмотров", conclusion: null, views: null, narrative_structure: [] },
    { material_id: 6, topic: null, core_concept: null, conclusion: "Итог: тему даёт только заключение референса", views: 120000, narrative_structure: [] },
  ];
  const ranked = rankProvenMaterials(provenMaterials);
  assert.equal(ranked.length, 3, "low-views and null-views materials are excluded");
  assert.equal(ranked[0].materialId, 2, "highest views first");
  assert.equal(ranked[1].materialId, 4, "duplicate concept keeps the higher-views material");
  assert.ok(!ranked.some((candidate) => candidate.materialId === 1), "lower-views duplicate dropped by dedup");
  assert.equal(ranked[0].topic, "Лангкави: жильё у моря за сто долларов", "conclusion wins the topic fallback chain");
  assert.equal(ranked[2].topic, "Итог: тему даёт только заключение референса", "conclusion covers missing concept");
  assert.equal(ranked[2].concept, "Итог: тему даёт только заключение референса", "concept falls back to conclusion text");
  assert.ok(ranked.every((candidate) => candidate.views >= 10000), "every candidate clears the viral threshold");
  assert.ok(ranked.every((candidate) => typeof candidate.frameId === "string" && candidate.frameId), "frame id always resolves");

  // No viral materials -> empty proven layer, not an error.
  assert.deepEqual(rankProvenMaterials([]), []);

  console.log("Omni topic engine checks passed");
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
