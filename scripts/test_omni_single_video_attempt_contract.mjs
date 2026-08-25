import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const completion = readFileSync(join(root, "ui/src/lib/server/omni/omni-segment-completion.ts"), "utf8");
const sync = readFileSync(join(root, "ui/src/lib/server/omni/omni-segment-sync.ts"), "utf8");
const runner = readFileSync(join(root, "ui/src/lib/server/omni/omni-reel-runner.ts"), "utf8");

assert.ok(!completion.includes("assertOmniSpeechQuality"), "completed video must not run speech QA");
assert.ok(!completion.includes("transcribeVideoBufferWithDeepgram"), "completed segment must not be transcribed for QA");
assert.ok(!sync.includes("resetSegmentForRetry"), "video sync must never reset a segment for regeneration");
assert.ok(!sync.includes("kie_task_id = NULL"), "video sync must preserve the only provider task id");
assert.ok(sync.includes("await markSegmentFailed(segment, task.raw, message)"), "provider failures must stop without retry");
assert.ok(!runner.includes("omni_retry_count"), "video requests must not carry retry state");

console.log("Omni single video attempt contract checks passed");
