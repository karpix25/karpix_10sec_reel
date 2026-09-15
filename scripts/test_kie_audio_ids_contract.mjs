import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "kie-audio-contract-"));
const require = createRequire(import.meta.url);

try {
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/kie-omni-audio.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const { detectKieOmniVoiceGender, resolveKieOmniAudioIds } = require(join(output, "kie-omni-audio.js"));
  clearEnv();
  assert.deepEqual(resolveKieOmniAudioIds({ data: { audio_ids: ["payload_voice"] } }), ["payload_voice"]);
  assert.deepEqual(resolveKieOmniAudioIds({ kie_audio_id: "bound_voice" }), ["bound_voice"]);

  clearEnv();
  assert.equal(detectKieOmniVoiceGender({ prompt: "Женщина в домашней одежде говорит в камеру" }), "female");
  assert.deepEqual(resolveKieOmniAudioIds({ prompt: "Женщина в домашней одежде говорит в камеру" }), []);

  clearEnv();
  assert.equal(detectKieOmniVoiceGender({ prompt: "Мужчина в худи снимает UGC ролик" }), "male");
  assert.deepEqual(resolveKieOmniAudioIds({ prompt: "Мужчина в худи снимает UGC ролик" }), []);
  console.log("KIE Omni audio id contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function clearEnv() {
}
