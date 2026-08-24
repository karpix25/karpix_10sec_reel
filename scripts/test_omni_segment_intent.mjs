import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-segment-intent-"));
const require = createRequire(import.meta.url);

try {
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/omni-intro-product-contract.ts",
      "src/lib/server/omni/omni-segment-intent.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const { deriveOmniSegmentIntents } = require(findFile(output, "omni-segment-intent.js"));
  const intents = deriveOmniSegmentIntents([
    {
      index: 1,
      text: "Я использую пенку Geodemika, чтобы мягко очищать кожу.",
      sourceIndex: 4,
      sourceSpan: { startSeconds: 0, endSeconds: 8 },
    },
    { index: 2, text: "Это не отменяет комплексный подход к уходу и привычкам." },
    { index: 3, text: "Сон, питание и спорт поддерживают результат каждый день." },
  ], "Geodemika Enzyme Cleansing Foam");

  assert.deepEqual(intents, [
    {
      index: 1,
      spokenText: "Я использую пенку Geodemika, чтобы мягко очищать кожу.",
      productMentioned: true,
      productVisible: true,
      sourceIndex: 4,
      sourceSpan: { startSeconds: 0, endSeconds: 8 },
    },
    {
      index: 2,
      spokenText: "Это не отменяет комплексный подход к уходу и привычкам.",
      productMentioned: false,
      productVisible: false,
    },
    {
      index: 3,
      spokenText: "Сон, питание и спорт поддерживают результат каждый день.",
      productMentioned: false,
      productVisible: false,
    },
  ]);
  assert.equal(
    deriveOmniSegmentIntents(
      [{ spokenText: "Сон и питание дают устойчивый результат." }],
      "Geodemika Enzyme Cleansing Foam"
    )[0].productVisible,
    false,
    "product name must not make a non-product spoken line visible"
  );

  console.log("Omni segment intent regression checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function findFile(directory, filename) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      try {
        return findFile(path, filename);
      } catch {
        continue;
      }
    }
    if (entry.name === filename) return path;
  }
  throw new Error(`File ${filename} not found in ${directory}`);
}
