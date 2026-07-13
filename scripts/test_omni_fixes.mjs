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
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const { selectReferenceImagesForComet } = require(join(output, "omni-reference-images.js"));

  const imgAvatar = { url: "avatar.png", fieldName: "ref", role: "avatar" };
  const imgProduct = { url: "product.png", fieldName: "ref", role: "product" };
  const imgComposite = { url: "composite.png", fieldName: "ref", role: "avatar_product_composite" };

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

  // 1. Prefer composite if all three exist
  {
    const result = selectReferenceImagesForComet([imgProduct, imgAvatar, imgComposite], "url", 2);
    assert.deepEqual(result.sent, [imgComposite]);
  }

  // 2. Prefer avatar over product if composite is missing
  {
    const result = selectReferenceImagesForComet([imgProduct, imgAvatar], "url", 2);
    assert.deepEqual(result.sent, [imgAvatar]);
  }

  // 3. Fallback to product only as last resort
  {
    const result = selectReferenceImagesForComet([imgProduct], "url", 2);
    assert.deepEqual(result.sent, [imgProduct]);
  }

  console.log("Omni reference image priority reliability checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
