import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
      join(ui, "src/lib/server/omni/director-analysis-types.ts"),
      join(ui, "src/lib/server/omni/director-analysis-prompt.ts"),
      join(ui, "src/lib/server/omni/scrapecreators-client.ts"),
      join(ui, "src/lib/server/omni/openrouter-director-analysis-client.ts"),
      join(ui, "src/lib/server/omni/script-json-repair.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const { normalizeDirectorBrief } = require(findFile(compiled, "director-analysis-types.js"));
  const { renderDirectorBriefForOmniPrompt } = require(findFile(compiled, "director-analysis-prompt.js"));
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

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OMNI_DIRECTOR_ANALYSIS_MODEL = "minimax/minimax-m3";
  let requestPayload = null;
  global.fetch = async (_url, init) => {
    requestPayload = JSON.parse(String(init.body));
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ director_brief: brief }) } }],
        usage: { total_tokens: 123 },
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
