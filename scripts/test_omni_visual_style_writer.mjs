import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-visual-style-"));
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
      join(ui, "src/lib/omni/creative-contract.ts"),
      join(ui, "src/lib/server/omni/omni-life-formats.ts"),
      join(ui, "src/lib/server/omni/omni-visual-style-writer.ts"),
      join(ui, "src/lib/server/omni/omni-format-selector.ts"),
    ],
  }));

  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    ["--project", tsconfig],
    { cwd: ui, stdio: "inherit" }
  );

  const contractOutput = findFile(compiled, "creative-contract.js");
  const aliasContract = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(aliasContract), { recursive: true });
  copyFileSync(contractOutput, aliasContract);

  const selectorOutput = findFile(compiled, "omni-format-selector.js");
  const { selectOmniCreativeStrategy } = require(selectorOutput);

  const strategy = selectOmniCreativeStrategy({
    script: "Коллаген стал моей спокойной утренней привычкой. Я не люблю сложный уход, поэтому выбираю то, что легко встроить в день. Артикул можно найти в описании.",
    firstSpokenLine: "Коллаген стал моей спокойной утренней привычкой.",
    productName: "Коллаген",
    productDescription: "Добавка для красоты кожи и волос",
    targetAudience: "женщины, уход за собой",
    hasProductReference: true,
    ctaMode: "article_in_description",
  });

  const scenePayload = JSON.stringify({
    setting: strategy.setting,
    props: strategy.continuityProps,
    states: strategy.visualStyle?.sceneArc.states,
  });
  assert.equal(strategy.version, "visual-style-writer-v1");
  assert.equal(strategy.lifeFormatId, "talking_head_cutaways");
  assert.ok(strategy.visualStyle, "visual style writer must attach a visual style plan");
  assert.ok(!/коридор|ключи|дверь/u.test(scenePayload), "beauty script must not fall back to corridor, keys, or door");
  assert.ok(!/полотенц|сумк|органайзер|шоппер/u.test(scenePayload), "talking-head style must not inherit old prop defaults");
  assert.equal(strategy.visualStyle.id, "talking_head_home");
  assert.ok(strategy.visualStyle.label.includes("говорящая голова"));

  const generic = selectOmniCreativeStrategy({
    script: "Я долго думала, почему обычные привычки не держатся. Потом оставила только один простой шаг. Артикул можно найти в описании.",
    firstSpokenLine: "Я долго думала, почему обычные привычки не держатся.",
    productName: "Полезный продукт",
    productDescription: "Помогает встроить новую привычку",
    targetAudience: "занятые люди",
    hasProductReference: false,
    ctaMode: "article_in_description",
  });
  assert.equal(generic.lifeFormatId, "talking_head_cutaways", "generic scripts should default to stable talking-head cutaways");
  assert.ok(generic.visualStyle?.forbiddenDefaults.some((item) => item.includes("коридор")));

  console.log("Omni visual style writer regression checks passed");
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
