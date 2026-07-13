import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-positive-prompt-"));
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
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/**/*.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const contractOutput = findFile(compiled, "creative-contract.js");
  const aliasContract = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(aliasContract), { recursive: true });
  copyFileSync(contractOutput, aliasContract);

  const { buildOmniSegmentPrompts } = require(findFile(compiled, "omni-prompt-builder.js"));
  const prompts = buildOmniSegmentPrompts({
    generatedScript: {
      id: 1,
      project_id: 1,
      product_id: 1,
      script: "Коллаген стал моей спокойной утренней привычкой. Я не люблю сложный уход, поэтому выбираю то, что легко встроить в день. Артикул можно найти в описании.",
    },
    legacyTranscript: null,
    product: {
      id: 1,
      project_id: 1,
      name: "Коллаген",
      description: "Добавка для красоты кожи и волос",
      product_reference_notes: null,
      product_refs: [],
      cta_mode: "article_in_description",
      cta_value: null,
    },
    avatar: null,
    segmentCount: 3,
    segmentSeconds: 10,
    brief: null,
    targetAudience: "женщины, уход за собой",
    ctaMode: "article_in_description",
    ctaValue: null,
    recentFormatIds: [],
  });

  const joinedPrompt = prompts.map((item) => item.prompt).join("\n");
  assert.ok(joinedPrompt.includes("ВИЗУАЛЬНЫЙ СТИЛЬ СЦЕНАРИСТА:"), "positive visual style must be rendered");
  assert.ok(joinedPrompt.includes("КАМЕРА И СВЕТ:"), "camera and light must be rendered");
  assert.ok(!joinedPrompt.includes("НЕ ИСПОЛЬЗОВАТЬ КАК ДЕФОЛТ"), "internal anti-default guard must not reach provider prompt");
  assert.ok(!/спокойный коридор как универсальная сцена|связка ключей как обязательный реквизит/u.test(joinedPrompt));

  console.log("Omni positive visual prompt regression checks passed");
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
