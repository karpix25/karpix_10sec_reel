import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Module, createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const temp = mkdtempSync(join(tmpdir(), "omni-yandex-test-"));
const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalToken = process.env.YANDEX_DISK_OAUTH_TOKEN;
const body = Buffer.from("complete generated video");
const localFilePath = join(temp, "video.mp4");
const filePath = "disk:/ВИДЕО/brand/avatar/product/omni/original_202609040001.mp4";
const good = { path: filePath, size: body.length, md5: createHash("md5").update(body).digest("hex"), public_url: "https://disk.yandex.test/public" };
let metadata = null, uploads = 0, mode = "normal", published = 0;
try {
  writeFileSync(localFilePath, body);
  writeFileSync(join(temp, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "es2022", module: "commonjs", moduleResolution: "node", jsx: "react-jsx", strict: true,
      esModuleInterop: true, skipLibCheck: true, rootDir: join(ui, "src"), outDir: join(temp, "compiled"),
      baseUrl: join(ui, "src"), paths: { "@/*": ["*"] }, types: ["node"], typeRoots: [join(ui, "node_modules/@types")] },
    include: [join(ui, "src/lib/server/omni/omni-yandex-delivery.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(temp, "tsconfig.json")], { cwd: ui, stdio: "inherit" });
  process.env.YANDEX_DISK_OAUTH_TOKEN = "local-test-placeholder";
  global.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    if (parsed.host === "upload.yandex.test") {
      uploads += 1;
      assert.equal(init.method, "PUT");
      assert.deepEqual(init.body, body);
      if (mode !== "timeout_missing") metadata = { ...good, public_url: mode === "publish_failed" ? undefined : good.public_url };
      if (mode.startsWith("timeout")) throw new DOMException("timeout", "TimeoutError");
      return new Response(null, { status: 201 });
    }
    assert.equal(parsed.host, "cloud-api.yandex.net", "No unmocked network");
    if (parsed.pathname.endsWith("/resources/upload")) {
      assert.equal(parsed.searchParams.get("overwrite"), "false");
      assert.equal(parsed.searchParams.get("path"), filePath);
      return Response.json({ href: "https://upload.yandex.test/target" });
    }
    if (parsed.pathname.endsWith("/resources/publish")) {
      published += 1;
      if (mode === "publish_failed") return new Response(null, { status: 503 });
      metadata = { ...good };
      return new Response(null, { status: 200 });
    }
    if (init.method === "PUT") return new Response(null, { status: 201 });
    assert.equal(parsed.searchParams.get("path"), filePath);
    if (mode === "metadata_failed") return new Response(null, { status: 403 });
    return metadata ? Response.json(metadata) : new Response(null, { status: 404 });
  };
  const helper = require(join(temp, "compiled/lib/server/yandex-disk-delivery.js"));
  metadata = { ...good };
  assert.equal((await helper.deliverVideoToYandex({ localFilePath, filePath })).filePath, filePath);
  assert.equal(uploads, 0, "Already delivered exact bytes must not be sent again");
  metadata = { ...good, md5: "different" };
  await assert.rejects(helper.deliverVideoToYandex({ localFilePath, filePath }), /другой файл/u);
  assert.equal(uploads, 0);
  metadata = null; mode = "timeout_completed";
  await helper.deliverVideoToYandex({ localFilePath, filePath });
  assert.equal(uploads, 1, "Uncertain upload resolved through metadata without a second PUT");
  metadata = null; mode = "timeout_missing";
  await assert.rejects(helper.deliverVideoToYandex({ localFilePath, filePath }), /загрузка видео.*время ожидания/u);
  assert.equal(uploads, 2, "Missing metadata does not start an automatic retry");
  metadata = { ...good }; mode = "normal";
  await helper.deliverVideoToYandex({ localFilePath, filePath });
  assert.equal(uploads, 2, "Next click checks whether the uncertain previous upload completed");
  metadata = null; mode = "publish_failed";
  await assert.rejects(helper.deliverVideoToYandex({ localFilePath, filePath }), /публикация ссылки.*503/u);
  assert.equal(uploads, 3); assert.equal(published, 1);
  mode = "normal";
  await helper.deliverVideoToYandex({ localFilePath, filePath });
  assert.equal(uploads, 3, "Publication-only recovery must reuse already uploaded video");
  assert.equal(published, 2);
  mode = "metadata_failed";
  await assert.rejects(helper.deliverVideoToYandex({ localFilePath, filePath }), /проверка файла.*403/u);
  assert.equal(uploads, 3);
  assert.throws(() => helper.buildYandexDeliveryPath("disk:/safe", "../other.mp4"), /неверное имя/u);
  assert.equal(helper.buildYandexDeliveryPath("disk:/safe", "a".repeat(200) + ".mp4"), "disk:/safe/" + "a".repeat(180), "Legacy filename truncation must target the same file");

  let reel = { id: 42, project_id: 2, product_id: 11, status: "completed", stitch_status: "completed", yandex_status: "failed", final_s3_url: "https://s3.test/final/original_202609040001.mp4", yandex_disk_path: filePath };
  const queries = [];
  let locked = false, deliveries = 0, sourceReads = 0;
  Module._load = function (request, parent, isMain) {
    if (request === "@/lib/db") return { query: async (sql, args) => {
      queries.push(sql);
      if (sql.includes("yandex_status = 'completed'")) reel = { ...reel, yandex_status: "completed", yandex_disk_path: args[1], yandex_public_url: args[2] };
      return { rows: [] };
    } };
    if (request === "./reels") return { getOmniReel: async () => ({ ...reel }) };
    if (request === "./projects") return { getOmniProject: async () => { throw new Error("Saved target needs no project lookup"); } };
    if (request === "./products") return {};
    if (request === "./omni-video-storage") return {};
    if (request === "./omni-reel-execution-lock") return { withOmniReelExecutionLock: async (_, callbacks) => locked ? callbacks.onLocked() : callbacks.run() };
    if (request === "@/lib/server/s3-storage") return { getReadableS3Url: async (url) => url };
    if (request === "@/lib/server/yandex-disk") return { isYandexDiskConfigured: () => true };
    if (request === "@/lib/server/yandex-disk-delivery") return { ...helper, deliverVideoToYandex: async (input) => {
      deliveries += 1; assert.equal(input.filePath, filePath); return { filePath, publicUrl: good.public_url };
    } };
    return originalLoad.call(this, request, parent, isMain);
  };
  global.fetch = async (url) => { assert.equal(url, reel.final_s3_url); sourceReads += 1; return new Response(body); };
  const recovery = require(join(temp, "compiled/lib/server/omni/omni-yandex-delivery.js"));
  locked = true;
  await assert.rejects(recovery.retryOmniYandexDelivery(42), /уже выполняется/u);
  assert.equal(sourceReads, 0);
  locked = false;
  assert.equal((await recovery.retryOmniYandexDelivery(42)).yandex_status, "completed");
  assert.equal(deliveries, 1); assert.equal(sourceReads, 1);
  await recovery.retryOmniYandexDelivery(42);
  assert.equal(deliveries, 1, "Completed delivery is idempotent");
  assert.ok(queries.every((sql) => !/SET status|stitch_status|final_video_url|final_s3_url/u.test(sql)), "Delivery must never reset generation, stitching or S3 video");
  console.log("Yandex delivery: checksum, uncertain timeout reconciliation, no overwrite, publication recovery, one attempt, reel lock and S3-only retry passed.");
} finally {
  Module._load = originalLoad;
  global.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.YANDEX_DISK_OAUTH_TOKEN;
  else process.env.YANDEX_DISK_OAUTH_TOKEN = originalToken;
  rmSync(temp, { recursive: true, force: true });
}
