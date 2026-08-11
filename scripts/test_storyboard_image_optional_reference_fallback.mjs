import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-image-ref-"));
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
    },
    include: [
      join(ui, "src/lib/server/omni/omni-storyboard-image-generator.ts"),
      join(ui, "src/lib/omni/storyboard/**/*.ts"),
      join(ui, "src/lib/omni/types.ts"),
    ],
  }));

  stubModule("@/lib/db", "module.exports = {};");
  stubModule("@/lib/server/s3-storage", "module.exports = { getS3Config() { return {}; }, putObjectToS3() { return 'https://s3.example.com/storyboard.jpg'; } };");
  stubModule("@/lib/server/yandex-disk", "module.exports = { isYandexDiskConfigured() { return false; }, uploadVideoFileToYandexFolder() {} };");

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  process.env.COMETAPI_KEY = "test-key";
  process.env.OPENROUTER_API_KEY = "test-key";
  const expiredDirectorUrl = "https://cdn.example.com/expired-director.jpg";
  const cometPrompts = [];
  const visionPayloads = [];
  let visionMode = "repair_then_pass";
  let visionRequests = 0;
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href === expiredDirectorUrl) return new Response("", { status: 403 });
    if (href.startsWith("https://openrouter.ai/")) {
      visionRequests += 1;
      visionPayloads.push(JSON.parse(String(options.body || "{}")));
      const shouldRepair = visionMode === "always_repair" || visionRequests === 1;
      return Response.json({
        model: "test-model",
        choices: [{
          message: {
            content: JSON.stringify({
              status: shouldRepair ? "repair" : "pass",
              confidence: 0.95,
              panels: [{ panel_index: 1, status: shouldRepair ? "repair" : "pass", violations: [] }],
              repair_instructions: shouldRepair ? ["restore the canonical black sleeveless top"] : [],
            }),
          },
        }],
      });
    }
    if (href.startsWith("https://api.cometapi.com/")) {
      cometPrompts.push(String(options.body?.get("prompt") || ""));
      return Response.json({ data: [{ b64_json: Buffer.from("storyboard").toString("base64") }] });
    }
    return new Response(new Blob([Buffer.from([255, 216, 255, 217])], { type: "image/jpeg" }), {
      headers: { "content-type": "image/jpeg" },
    });
  };

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message, details) => warnings.push({ message, details });

  try {
    const { generateStoryboardImage } = require(findFile(compiled, "omni-storyboard-image-generator.js"));
    const result = await generateStoryboardImage({
      projectId: 6,
      reelId: 10,
      segmentIndex: 1,
      storyboard: storyboard(),
      productName: "Коллаген",
      avatarReferenceUrl: "https://cdn.example.com/avatar.jpg",
      canonicalStoryboardReferenceUrl: "https://cdn.example.com/first-storyboard.jpg",
      productReferenceUrls: ["https://cdn.example.com/product.jpg"],
      directorReferenceImageUrls: [expiredDirectorUrl],
    });

    assert.equal(result, "https://s3.example.com/storyboard.jpg");
    assert.match(warnings[0].message, /Optional storyboard reference image skipped/u);
    assert.equal(visionRequests, 2, "a repairable storyboard gets one retry");
    assert.ok(cometPrompts[0].includes("эталон одежды из первого утверждённого storyboard"));
    assert.ok(cometPrompts[1].includes("PHYSICAL REPAIR FROM PRIOR CHECK"));
    assert.equal(visionPayloads[0].messages[1].content.filter((item) => item.type === "image_url").length, 2, "vision compares the candidate with the canonical outfit storyboard");
    assert.ok(!cometPrompts[0].includes(expiredDirectorUrl));
    assert.ok(!cometPrompts[0].includes("Director reference image URLs:"));

    visionMode = "always_repair";
    visionRequests = 0;
    await assert.rejects(
      () => generateStoryboardImage({
        projectId: 6,
        reelId: 10,
        segmentIndex: 2,
        storyboard: storyboard(),
        productName: "Коллаген",
        avatarReferenceUrl: "https://cdn.example.com/avatar.jpg",
        canonicalStoryboardReferenceUrl: "https://cdn.example.com/first-storyboard.jpg",
      }),
      /Storyboard image blocked by vision validation/u
    );
    assert.equal(visionRequests, 2, "video-ready storyboard flow stops after the single retry is exhausted");
  } finally {
    console.warn = originalWarn;
  }

  console.log("Storyboard image optional reference fallback checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function storyboard() {
  return {
    segmentIndex: 1,
    durationSeconds: 10,
    voiceoverText: "Тест один два три четыре",
    frames: Array.from({ length: 5 }, (_, index) => ({
      spokenText: `Кадр ${index + 1} тест`,
      visualAction: "герой показывает продукт",
      camera: "selfie close-up",
      environment: "домашняя кухня",
      wardrobe: "светлая футболка",
      productPlacement: "продукт в руке",
      sfxNotes: "тихий бытовой звук",
      effectNotes: "быстрая склейка",
    })),
  };
}

function stubModule(name, code) {
  const target = join(output, "node_modules", ...name.split("/")) + ".js";
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, code);
}

function findFile(dir, fileName) {
  const entries = execFileSync("find", [dir, "-name", fileName], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (!entries[0]) throw new Error(`Compiled file not found: ${fileName}`);
  return entries[0];
}
