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
      join(ui, "src/lib/server/omni/omni-video-task-dispatch.ts"),
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

  const { createOmniVideoTask } = require(findFile(compiled, "omni-video-task-dispatch.js"));
  process.env.KIE_API_KEY = "test-key";

  let lastPayload = null;
  global.fetch = async (_url, init = {}) => {
    lastPayload = JSON.parse(String(init.body));
    return {
      ok: true,
      json: async () => ({ data: { taskId: "task_1", status: "queued" } }),
    };
  };

  await createOmniVideoTask(buildDispatchInput({
    characterId: null,
    facelessReferenceScene: true,
    referenceImages: [{ url: "https://example.com/storyboard.jpg", role: "storyboard" }],
  }));
  assert.equal(lastPayload.input.character_ids, undefined, "storyboard reference must disable character_id to prevent wardrobe conflicts");

  await createOmniVideoTask(buildDispatchInput({
    characterId: "char_1",
    facelessReferenceScene: true,
    referenceImages: [{ url: "https://example.com/storyboard.jpg", role: "storyboard" }],
  }));
  assert.equal(lastPayload.input.character_ids, undefined, "character_id must stay omitted when storyboard is visual authority");

  await assert.rejects(
    () => createOmniVideoTask(buildDispatchInput({
      characterId: null,
      facelessReferenceScene: false,
      referenceImages: [{ url: "https://example.com/product.jpg", role: "product" }],
    })),
    /requires an approved avatar character id/
  );

  console.log("KIE storyboard character conflict contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function buildDispatchInput(overrides) {
  return {
    provider: "kie-ai",
    facelessReferenceScene: false,
    prompt: "prompt",
    durationSeconds: 10,
    resolution: "1080p",
    referenceImages: [],
    imageUrls: [],
    characterId: null,
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
