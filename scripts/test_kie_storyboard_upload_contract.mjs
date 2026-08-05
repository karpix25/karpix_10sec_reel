import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "kie-storyboard-upload-"));
const compiled = join(output, "compiled");
const tsconfig = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [
      join(ui, "src/lib/server/omni/kie-omni-client.ts"),
      join(ui, "src/lib/server/omni/kie-file-upload-client.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const { createKieStoryboardImage } = require(findFile(compiled, "kie-omni-client.js"));
  process.env.KIE_API_KEY = "test-key";
  const uploadedSources = [];
  let storyboardPayload = null;

  global.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/api/file-url-upload")) {
      const body = JSON.parse(String(init.body));
      uploadedSources.push(body.fileUrl);
      assert.equal(body.uploadPath, "omni/storyboards");
      return response({ data: { downloadUrl: `https://kie.example/${uploadedSources.length}.jpg` } });
    }
    if (requestUrl.endsWith("/api/v1/jobs/createTask")) {
      storyboardPayload = JSON.parse(String(init.body));
      return response({ data: { taskId: "storyboard-task", status: "queued" } });
    }
    if (requestUrl.includes("/api/v1/jobs/recordInfo")) {
      return response({ data: { state: "success", imageUrl: "https://kie.example/storyboard.jpg" } });
    }
    throw new Error(`Unexpected KIE request: ${requestUrl}`);
  };

  const result = await createKieStoryboardImage({
    prompt: "storyboard",
    inputUrls: ["https://source.example/avatar.jpg", "https://source.example/product.jpg"],
  });
  assert.equal(result, "https://kie.example/storyboard.jpg");
  assert.deepEqual(uploadedSources, [
    "https://source.example/avatar.jpg",
    "https://source.example/product.jpg",
  ]);
  assert.deepEqual(storyboardPayload.input.input_urls, [
    "https://kie.example/1.jpg",
    "https://kie.example/2.jpg",
  ]);
  console.log("KIE storyboard upload contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function response(payload) {
  return { ok: true, status: 200, json: async () => payload };
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
  throw new Error(`Could not find ${fileName}`);
}
