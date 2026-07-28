import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "kie-storyboard-character-contract-"));
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
      join(ui, "src/lib/omni/provider.ts"),
      join(ui, "src/lib/server/omni/omni-provider-tasks.ts"),
      join(ui, "src/lib/server/omni/kie-omni-client.ts"),
      join(ui, "src/lib/server/omni/comet-video-client.ts"),
      join(ui, "src/lib/server/omni/kie-file-upload-client.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const providerOutput = findFile(compiled, "provider.js");
  const aliasProvider = join(output, "node_modules", "@", "lib", "omni", "provider.js");
  mkdirSync(dirname(aliasProvider), { recursive: true });
  copyFileSync(providerOutput, aliasProvider);

  const { createProviderVideoTask } = require(findFile(compiled, "omni-provider-tasks.js"));
  process.env.KIE_API_KEY = "test-key";

  let lastPayload = null;
  global.fetch = async (_url, init = {}) => {
    lastPayload = JSON.parse(String(init.body));
    return {
      ok: true,
      json: async () => ({ data: { taskId: "task_1", status: "queued" } }),
    };
  };

  await createProviderVideoTask(buildKieInput({
    characterId: null,
    referenceImages: [{ url: "https://example.com/storyboard.jpg", role: "storyboard" }],
  }));
  assert.equal(lastPayload.input.character_ids, undefined, "storyboard reference must disable character_id to prevent wardrobe conflicts");

  await createProviderVideoTask(buildKieInput({
    characterId: "char_1",
    referenceImages: [{ url: "https://example.com/storyboard.jpg", role: "storyboard" }],
  }));
  assert.equal(lastPayload.input.character_ids, undefined, "character_id must stay omitted when storyboard is visual authority");

  await createProviderVideoTask(buildKieInput({
    characterId: "char_1",
    referenceImages: [{ url: "https://example.com/product.jpg", role: "product" }],
  }));
  assert.deepEqual(lastPayload.input.character_ids, ["char_1"]);

  await assert.rejects(
    () => createProviderVideoTask(buildKieInput({
      characterId: null,
      referenceImages: [{ url: "https://example.com/product.jpg", role: "product" }],
    })),
    /requires character id or storyboard reference/
  );

  console.log("KIE storyboard character conflict contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function buildKieInput(overrides) {
  return {
    provider: "kie-ai",
    prompt: "prompt",
    seconds: 10,
    resolution: "1080p",
    audioIds: [],
    ...overrides,
  };
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
