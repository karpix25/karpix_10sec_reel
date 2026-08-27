import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-director-boundary-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);

function findFile(base, filename) {
  const queue = [base];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      if (entry.isFile() && entry.name === filename) return fullPath;
    }
  }
  throw new Error(`File ${filename} not found`);
}

try {
  const tsconfig = join(output, "tsconfig.json");
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
      join(ui, "src/lib/server/omni/director-analysis-prompt.ts"),
      join(ui, "src/lib/server/omni/openrouter-director-analysis-client.ts"),
      join(ui, "src/lib/server/omni/openrouter-pricing.ts"),
      join(ui, "src/lib/server/omni/script-adaptation-contract.ts"),
      join(ui, "src/lib/server/omni/script-json-repair.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const aliasRoot = join(output, "node_modules", "@", "lib");
  mkdirSync(join(aliasRoot, "omni"), { recursive: true });
  copyFileSync(findFile(compiled, "creative-contract.js"), join(aliasRoot, "omni", "creative-contract.js"));
  copyFileSync(findFile(compiled, "openrouter-cost.js"), join(aliasRoot, "omni", "openrouter-cost.js"));

  const { analyzeDirectorVideo } = require(findFile(compiled, "openrouter-director-analysis-client.js"));
  const brief = {
    visual_hook: { action: "говорит в камеру", retention_trigger: "прямой взгляд" },
    atmosphere: { mood: "спокойный", lighting: "мягкий свет", color_grading: "натуральный", setting: "комната" },
    clothing: { style: "простая одежда", color_palette: ["черный"], fit_details: "свободный", source: "presenter" },
    camera: { shot_types: ["medium"], angles: ["eye level"], movements: ["static"], stabilization: "stable" },
    montage_rhythm: { cut_pace: "one shot", beat_sync: "speech", transition_style: ["none"] },
    reusable_mechanics: { visual_mechanics: ["direct address"], safe_zones_for_elements: "none", looping_pattern: "none" },
  };
  process.env.OPENROUTER_API_KEY = "test-key";
  let payload;
  global.fetch = async (url, init = {}) => {
    if (String(url).includes("/api/v1/model/")) return { ok: true, json: async () => ({ data: { pricing: {} } }) };
    payload = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ model: "google/gemini-3.5-flash-lite", choices: [{ message: { content: JSON.stringify({ director_brief: brief, spoken_transcript: "Текст из аудио." }) } }], usage: {} }) };
  };

  const result = await analyzeDirectorVideo({ videoUrl: "https://example.com/reference.mp4", transcript: "" });
  assert.equal(result.transcript, "Текст из аудио.");
  assert.equal(payload.messages[1].content.some((item) => item.type === "image_url"), false);
  assert.equal(payload.messages[1].content.some((item) => item.type === "video_url"), true);
  assert.match(payload.messages[1].content[0].text, /spoken_transcript/u);
  assert.doesNotMatch(payload.messages[1].content[0].text, /content_adaptation/u);

  console.log("Omni director visual boundary checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
