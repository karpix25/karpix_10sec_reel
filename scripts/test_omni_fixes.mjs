import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-fixes-test-"));
const require = createRequire(import.meta.url);

try {
  // Compile the reference images module
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/omni-reference-images.ts",
      "src/lib/server/omni/omni-product-reference-images.ts",
      "src/lib/server/omni/omni-continuity-prompt.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const {
    selectReferenceImagesForComet,
    selectReferenceImagesForSegment,
  } = require(join(output, "omni-reference-images.js"));
  const { resolveProductReferenceImageUrls } = require(join(output, "omni-product-reference-images.js"));
  const {
    appendContinuityPromptContract,
    appendKieReferenceOrderPrompt,
  } = require(join(output, "omni-continuity-prompt.js"));

  const imgAvatar = { url: "avatar.png", fieldName: "ref", role: "avatar" };
  const imgProduct = { url: "product.png", fieldName: "ref", role: "product" };
  const imgProductSide = { url: "product-side.png", fieldName: "ref", role: "product_secondary" };
  const imgComposite = { url: "composite.png", fieldName: "ref", role: "avatar_product_composite" };
  const imgPreviousFrame = { url: "segment-01-last-frame.jpg", fieldName: "ref", role: "previous_last_frame" };

  {
    const previousWebappBaseUrl = process.env.WEBAPP_BASE_URL;
    process.env.WEBAPP_BASE_URL = "https://n8n-omnireels.ap2dy7.easypanel.host/";
    const urls = resolveProductReferenceImageUrls({
      product_refs: [
        { url: "https://cdn.example.com/side.png", kind: "image", status: "ready", is_primary: false },
        { url: "/uploads/front.png", kind: "image", status: "ready", is_primary: true },
        { url: "https://cdn.example.com/failed.png", kind: "image", status: "failed", is_primary: false },
        { url: "https://cdn.example.com/video.mp4", kind: "video", status: "ready", is_primary: false },
        { url: "https://cdn.example.com/side.png", kind: "image", status: "ready", is_primary: false },
      ],
    });
    if (previousWebappBaseUrl === undefined) {
      delete process.env.WEBAPP_BASE_URL;
    } else {
      process.env.WEBAPP_BASE_URL = previousWebappBaseUrl;
    }
    assert.deepEqual(urls, [
      "https://n8n-omnireels.ap2dy7.easypanel.host/uploads/front.png",
      "https://cdn.example.com/side.png",
    ]);
  }

  // --- Segment 1 (speaking segment) priority order tests ---
  
  // 1. Prefer avatar if both avatar and product exist
  {
    const result = selectReferenceImagesForComet([imgProduct, imgAvatar], "url", 1);
    assert.deepEqual(result.sent, [imgAvatar]);
  }

  // 2. Prefer avatar if all three exist
  {
    const result = selectReferenceImagesForComet([imgProduct, imgComposite, imgAvatar], "url", 1);
    assert.deepEqual(result.sent, [imgAvatar]);
  }

  // 3. Fallback to composite if avatar is missing
  {
    const result = selectReferenceImagesForComet([imgProduct, imgComposite], "url", 1);
    assert.deepEqual(result.sent, [imgComposite]);
  }

  // 4. Fallback to product only as last resort
  {
    const result = selectReferenceImagesForComet([imgProduct], "url", 1);
    assert.deepEqual(result.sent, [imgProduct]);
  }

  // --- Later segments (product-visible) priority order tests ---

  // 1. Prefer previous segment last frame if it exists
  {
    const result = selectReferenceImagesForComet(
      [imgProduct, imgAvatar, imgComposite, imgPreviousFrame],
      "url",
      2
    );
    assert.deepEqual(result.sent, [imgPreviousFrame]);
  }

  // 2. Prefer composite if all three static refs exist
  {
    const result = selectReferenceImagesForComet([imgProduct, imgAvatar, imgComposite], "url", 2);
    assert.deepEqual(result.sent, [imgComposite]);
  }

  // 3. Prefer avatar over product if composite is missing
  {
    const result = selectReferenceImagesForComet([imgProduct, imgAvatar], "url", 2);
    assert.deepEqual(result.sent, [imgAvatar]);
  }

  // 4. Fallback to product only as last resort
  {
    const result = selectReferenceImagesForComet([imgProduct], "url", 2);
    assert.deepEqual(result.sent, [imgProduct]);
  }

  // --- Continuity prompt contract ---

  {
    const result = selectReferenceImagesForSegment({
      provider: "kie-ai",
      continuityImages: [],
      cometReferenceImages: [imgAvatar, imgProduct],
      kieReferenceImages: [imgProduct, imgProductSide],
      referenceImageTransport: "url",
      segmentIndex: 1,
      productIsVisible: false,
    });
    assert.deepEqual(result.sent, [imgProduct, imgProductSide], "KIE must send product refs even when product role is hidden");
    assert.deepEqual(result.skipped, [], "KIE must not skip product refs by visibility heuristic");
  }

  {
    const result = selectReferenceImagesForSegment({
      provider: "cometapi",
      continuityImages: [],
      cometReferenceImages: [imgAvatar, imgProduct],
      kieReferenceImages: [imgProduct],
      referenceImageTransport: "url",
      segmentIndex: 1,
      productIsVisible: false,
    });
    assert.deepEqual(result.sent, [imgAvatar], "Comet first segment keeps avatar-only behavior when product is hidden");
    assert.deepEqual(result.skipped, [imgProduct]);
  }

  {
    const prompt = appendContinuityPromptContract("Original segment prompt.");
    assert.match(prompt, /Original segment prompt\./);
    assert.match(prompt, /final pose and layout/);
    assert.match(prompt, /Do not create a sudden camera cut/);
  }

  {
    const prompt = appendKieReferenceOrderPrompt("Original segment prompt.", [
      { role: "previous_last_frame" },
      { role: "product" },
    ]);
    assert.match(prompt, /Image 1: previous segment final frame/);
    assert.match(prompt, /Image 2: product reference/);
    assert.match(prompt, /exact standalone source of truth for product appearance/);
    assert.match(prompt, /table, counter, shelf/);
  }

  {
    const prompt = appendKieReferenceOrderPrompt("Original segment prompt.", [
      { role: "product" },
    ]);
    assert.match(prompt, /Image 1: product reference/);
    assert.match(prompt, /exact standalone source of truth for product appearance/);
    assert.match(prompt, /cap or lid color/);
    assert.match(prompt, /must not define the character outfit/);
  }

  console.log("Omni reference image priority reliability checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
