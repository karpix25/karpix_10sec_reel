import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-intro-product-visibility-"));
const compiled = join(output, "compiled");
const tsconfig = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: [
      join(ui, "src/lib/server/omni/omni-reference-images.ts"),
      join(ui, "src/lib/server/omni/omni-intro-product-contract.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });
  const { selectReferenceImagesForSegment } = require(findFile(compiled, "omni-reference-images.js"));
  const {
    getOmniProductRevealFrame,
    mentionsExplicitOmniProduct,
    mentionsOmniProduct,
  } = require(findFile(compiled, "omni-intro-product-contract.js"));
  const references = [
    { url: "https://example.com/storyboard.jpg", fieldName: "input_reference", role: "storyboard" },
    { url: "https://example.com/product.jpg", fieldName: "input_reference", role: "product" },
    { url: "https://example.com/product-2.jpg", fieldName: "input_reference", role: "product_secondary" },
  ];

  const firstKie = selectReferenceImagesForSegment({
    provider: "kie-ai",
    continuityImages: [],
    cometReferenceImages: references,
    kieReferenceImages: references,
    referenceImageTransport: "url",
    segmentIndex: 1,
    productIsVisible: true,
  });
  assert.deepEqual(firstKie.sent.map((image) => image.role), ["storyboard", "product", "product_secondary"]);
  assert.deepEqual(firstKie.skipped.map((image) => image.role), []);

  const secondKie = selectReferenceImagesForSegment({
    provider: "kie-ai",
    continuityImages: [],
    cometReferenceImages: references,
    kieReferenceImages: references,
    referenceImageTransport: "url",
    segmentIndex: 2,
    productIsVisible: true,
  });
  assert.deepEqual(secondKie.sent.map((image) => image.role), ["storyboard", "product", "product_secondary"]);

  const hiddenProductKie = selectReferenceImagesForSegment({
    provider: "kie-ai",
    continuityImages: [],
    cometReferenceImages: references,
    kieReferenceImages: [
      references[0],
      { url: "https://example.com/first-storyboard.jpg", fieldName: "input_reference", role: "storyboard_canonical" },
      ...references.slice(1),
    ],
    referenceImageTransport: "url",
    segmentIndex: 3,
    productIsVisible: false,
  });
  assert.deepEqual(hiddenProductKie.sent.map((image) => image.role), ["storyboard"]);
  assert.deepEqual(hiddenProductKie.skipped.map((image) => image.role), ["storyboard_canonical", "product", "product_secondary"]);

  const firstComet = selectReferenceImagesForSegment({
    provider: "cometapi",
    continuityImages: [],
    cometReferenceImages: [
      { url: "https://example.com/avatar.jpg", fieldName: "input_reference", role: "avatar" },
      ...references.slice(1),
    ],
    kieReferenceImages: [],
    referenceImageTransport: "url",
    segmentIndex: 1,
    productIsVisible: true,
  });
  assert.deepEqual(firstComet.sent.map((image) => image.role), ["avatar"]);
  assert.deepEqual(firstComet.skipped.map((image) => image.role), ["product", "product_secondary"]);
  assert.equal(mentionsOmniProduct("Почему после умывания кожу снова стягивает?", "Geodemika Enzyme Cleansing Foam"), false);
  assert.equal(mentionsOmniProduct("Эта энзимная пенка мягко очищает кожу.", "Geodemika Enzyme Cleansing Foam"), true);
  assert.equal(mentionsOmniProduct("Geodemika решает эту проблему.", "Geodemika"), true);
  assert.equal(mentionsExplicitOmniProduct("Есть ли смысл принимать коллаген после тридцати пяти лет?", "Коллаген"), false);
  assert.equal(mentionsExplicitOmniProduct("Вот этот апельсиновый коллаген, артикул в описании.", "Коллаген"), true);
  assert.equal(mentionsOmniProduct("А еще я всегда беру с собой апельсиновый коллаген.", "Коллаген"), true);
  assert.equal(getOmniProductRevealFrame([
    "Есть ли смысл принимать коллаген после тридцати пяти лет?",
    "Вот этот апельсиновый коллаген, артикул в описании.",
  ], "Коллаген"), 0);

  console.log("Omni intro product visibility contract checks passed");
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
