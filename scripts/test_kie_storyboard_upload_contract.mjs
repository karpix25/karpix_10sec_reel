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

  const {
    createKieStoryboardImage,
    isKieStoryboardImagePendingError,
  } = require(findFile(compiled, "kie-omni-client.js"));
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
    throw new Error(`Unexpected KIE request: ${requestUrl}`);
  };

  await assert.rejects(
    () => createKieStoryboardImage({
      prompt: "storyboard",
      inputUrls: ["https://source.example/avatar.jpg", "https://source.example/product.jpg"],
    }),
    (error) => isKieStoryboardImagePendingError(error) && error.task.id === "storyboard-task"
  );
  assert.deepEqual(uploadedSources, [
    "https://source.example/avatar.jpg",
    "https://source.example/product.jpg",
  ]);
  assert.deepEqual(storyboardPayload.input.input_urls, [
    "https://kie.example/1.jpg",
    "https://kie.example/2.jpg",
  ]);

  const fallbackUploads = [];
  let failedUrlUploadAttempts = 0;
  global.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/api/file-url-upload")) {
      const body = JSON.parse(String(init.body));
      if (body.fileUrl.includes("director.jpg")) {
        failedUrlUploadAttempts += 1;
        return new Response(JSON.stringify({ msg: "remote fetch timeout" }), { status: 502 });
      }
      return response({ data: { downloadUrl: "https://kie.example/avatar.jpg" } });
    }
    if (requestUrl === "https://source.example/director.jpg") {
      return new Response(Buffer.from("director-frame"), {
        headers: { "content-type": "image/jpeg", "content-length": "14" },
      });
    }
    if (requestUrl.endsWith("/api/file-base64-upload")) {
      fallbackUploads.push(JSON.parse(String(init.body)));
      return response({ data: { downloadUrl: "https://kie.example/director.jpg" } });
    }
    if (requestUrl.endsWith("/api/v1/jobs/createTask")) {
      storyboardPayload = JSON.parse(String(init.body));
      return response({ data: { taskId: "fallback-storyboard-task", status: "queued" } });
    }
    throw new Error(`Unexpected KIE request: ${requestUrl}`);
  };
  await assert.rejects(
    () => createKieStoryboardImage({
      prompt: "storyboard",
      inputUrls: ["https://source.example/avatar.jpg", "https://source.example/director.jpg"],
    }),
    (error) => isKieStoryboardImagePendingError(error) && error.task.id === "fallback-storyboard-task"
  );
  assert.equal(failedUrlUploadAttempts, 3);
  assert.equal(fallbackUploads.length, 1);
  assert.match(fallbackUploads[0].base64Data, /^data:image\/jpeg;base64,/u);
  assert.deepEqual(storyboardPayload.input.input_urls, [
    "https://kie.example/avatar.jpg",
    "https://kie.example/director.jpg",
  ]);

  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/api/file-url-upload")) {
      return new Response(JSON.stringify({ msg: "remote fetch timeout" }), { status: 502 });
    }
    if (requestUrl === "https://source.example/broken.jpg") {
      return new Response("unavailable", { status: 503 });
    }
    throw new Error(`Unexpected KIE request: ${requestUrl}`);
  };
  await assert.rejects(
    () => createKieStoryboardImage({ prompt: "storyboard", inputUrls: ["https://source.example/broken.jpg"] }),
    /remote fetch timeout.*source image download failed: 503/u
  );

  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/api/v1/jobs/recordInfo")) {
      return response({ data: { taskId: "storyboard-task", state: "success", imageUrl: "https://kie.example/storyboard.jpg" } });
    }
    throw new Error(`Unexpected KIE request: ${requestUrl}`);
  };
  const result = await createKieStoryboardImage({
    prompt: "unused while resuming",
    inputUrls: [],
    taskId: "storyboard-task",
  });
  assert.equal(result.imageUrl, "https://kie.example/storyboard.jpg");

  global.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/api/file-url-upload")) {
      return response({ data: { downloadUrl: "https://kie.example/pending-input.jpg" } });
    }
    if (requestUrl.endsWith("/api/v1/jobs/createTask")) {
      return response({ data: { taskId: "pending-storyboard-task", status: "queued" } });
    }
    if (requestUrl.includes("/api/v1/jobs/recordInfo")) {
      return response({ data: { taskId: "pending-storyboard-task", state: "generating" } });
    }
    throw new Error(`Unexpected KIE request: ${requestUrl}`);
  };
  await assert.rejects(
    () => createKieStoryboardImage({ prompt: "storyboard", inputUrls: ["https://source.example/avatar.jpg"] }),
    (error) => isKieStoryboardImagePendingError(error) && error.task.id === "pending-storyboard-task"
  );
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
