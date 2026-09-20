import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-reference-materials-"));
const dist = join(output, "dist");
const require = createRequire(import.meta.url);

try {
  // Compile with the project tsconfig (keeps the @/* path alias working) so the
  // whole runtime dependency graph of the materials module is emitted.
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
        baseUrl: join(ui),
        paths: { "@/*": ["src/*"] },
      },
      include: [
        join(ui, "src/lib/server/omni/omni-reference-materials.ts"),
        join(ui, "src/lib/server/omni/director-analysis-types.ts"),
      ],
    })
  );
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["-p", join(output, "tsconfig.json")], {
    cwd: ui,
    stdio: "inherit",
  });

  const materialsPath = findFile(dist, "omni-reference-materials.js");
  const dbStubPath = join(output, "db-stub.js");
  writeFileSync(
    dbStubPath,
    'module.exports = { query: async () => { throw new Error("DB forbidden in digest test"); }, connect: async () => { throw new Error("DB forbidden in digest test"); } };'
  );
  const nodeModule = require("node:module");
  const originalResolveFilename = nodeModule._resolveFilename;
  nodeModule._resolveFilename = function (request, ...args) {
    if (request === "@/lib/db") return dbStubPath;
    return originalResolveFilename.call(this, request, ...args);
  };
  let materials;
  try {
    materials = require(materialsPath);
  } finally {
    nodeModule._resolveFilename = originalResolveFilename;
  }
  const { deriveReferenceMaterialDigest } = materials;

  const completeAnalysis = {
    director_analysis_status: "completed",
    original_reels_url: "https://instagram.com/reel/abc123/",
    director_analysis_json: {
      content_meaning: {
        topic: "утренний уход за кожей",
        core_concept: "показать быстрый ритуал без лишних шагов",
        hook_mechanism: "неожиданный вопрос в первую секунду",
        narrative_structure: ["Крючок (Hook)", "Проблема (Problem)", "Решение (Solution)", "Призыв (CTA)"],
        problem_or_question: "слишком много баночек",
        key_arguments: ["три шага", "минута времени"],
        proof_or_examples: ["до и после"],
        conclusion: "простота работает",
        cta_mechanism: "вопрос в комментарии",
      },
      visual_hook: { action: "крупный план рук с флаконом", retention_trigger: "интрига до середины" },
      atmosphere: { mood: "спокойный", lighting: "мягкий утренний", color_grading: ["теплый"], setting: "ванная" },
      clothing: { style: "домашний", color_palette: ["бежевый"], fit_details: "free", source: "reference" },
      wardrobe_continuity: { mode: "same", notes: "" },
      subject_continuity: { mode: "same", notes: "" },
      wardrobe_timeline: [],
      camera: { shot_types: ["medium", "close-up"], angles: ["center"], movements: ["static"], stabilization: "штатив" },
      camera_timeline: [
        { start_sec: 0, environment: "ванная", speech_mode: "voiceover_only", shot_types: ["close-up"], angles: ["center"], movements: ["static"] },
        { start_sec: 8, environment: "ванная", speech_mode: "on_camera", shot_types: ["medium"], angles: ["center"], movements: ["handheld"] },
      ],
      montage_rhythm: { cut_pace: "умеренный", beat_sync: "на акценты", transition_style: ["резкий"] },
      action_beats: [{ timestamp_sec: 2, action_description: "нанесение крема", actor_gesture: "рука к лицу" }],
      prop_sources: ["флакон"],
      hand_object_interactions: ["держит флакон"],
      motion_continuity: ["одна рука"],
      reference_action_style: "спокойный",
      reusable_mechanics: { visual_mechanics: ["крупный план продукта в руке"], safe_zones_for_elements: "центр", looping_pattern: "нет" },
      reference_format_mode: "voiceover_montage",
      reference_render_mode: "live_action",
      reference_motion_mode: "montage",
      product_introduction: {
        first_appearance_sec: 9,
        relative_position: "body",
        introduction_style: "в руке во время демонстрации",
        naturality_notes: "без паузы на рекламу",
      },
    },
    source_snapshot: {
      title: "Утренний уход",
      topic: "уход",
      reels_url: "https://instagram.com/reel/abc123/",
      duration_seconds: 26.4,
    },
  };

  const digest = deriveReferenceMaterialDigest(completeAnalysis);
  assert.ok(digest, "completed analysis must produce a digest");
  assert.equal(digest.format_mode, "voiceover_montage");
  assert.equal(digest.motion_mode, "montage");
  assert.equal(digest.product_position, "body");
  assert.equal(digest.topic, "утренний уход за кожей");
  assert.equal(digest.hook_mechanism, "неожиданный вопрос в первую секунду");
  assert.equal(digest.visual_hook_action, "крупный план рук с флаконом");
  assert.equal(digest.retention_trigger, "интрига до середины");
  assert.deepEqual(digest.narrative_structure, ["Крючок (Hook)", "Проблема (Problem)", "Решение (Solution)", "Призыв (CTA)"]);
  assert.equal(digest.duration_seconds, 26, "fractional duration rounds to whole seconds");
  assert.equal(digest.source_reels_url, "https://instagram.com/reel/abc123/");
  assert.ok(digest.material_json.camera_timeline.length === 2, "timeline travels into material_json");
  assert.ok(Array.isArray(digest.material_json.reusable_mechanics.visual_mechanics), "reusable mechanics preserved");
  assert.equal(digest.material_json.cta_mechanism, "вопрос в комментарии");
  assert.equal(digest.material_json.product_introduction.introduction_style, "в руке во время демонстрации");

  // References without a product must still yield a material with position never.
  const productlessAnalysis = structuredClone(completeAnalysis);
  productlessAnalysis.director_analysis_json.product_introduction = {
    first_appearance_sec: 0,
    relative_position: "never",
    introduction_style: "",
    naturality_notes: "",
  };
  const productlessDigest = deriveReferenceMaterialDigest(productlessAnalysis);
  assert.ok(productlessDigest, "product-less reference still produces material");
  assert.ok(!productlessDigest.product_position || productlessDigest.product_position === "never", "missing product is encoded as never");

  // Missing brief yields no digest instead of a half-empty library row.
  assert.equal(deriveReferenceMaterialDigest({ director_analysis_status: "failed", director_analysis_json: null }), null);
  assert.equal(deriveReferenceMaterialDigest({}), null);

  console.log("Omni reference materials digest checks passed");
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
