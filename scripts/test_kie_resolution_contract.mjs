import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const runnerSource = readFileSync(
  resolve(root, "ui/src/lib/server/omni/omni-reel-runner.ts"),
  "utf8"
);

assert.ok(
  runnerSource.includes('resolution: provider === "kie-ai" ? "1080p" : "720p"'),
  "KIE Omni video requests must use 1080p resolution"
);
assert.ok(
  runnerSource.includes("resolution: requestPayload.resolution"),
  "provider task resolution must stay aligned with stored request payload"
);

console.log("KIE Omni resolution contract checks passed");
