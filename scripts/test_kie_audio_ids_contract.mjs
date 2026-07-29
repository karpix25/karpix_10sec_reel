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
  const previous = {
    KIE_OMNI_AUDIO_IDS: process.env.KIE_OMNI_AUDIO_IDS,
    KIE_OMNI_AUDIO_ID: process.env.KIE_OMNI_AUDIO_ID,
    KIE_AUDIO_IDS: process.env.KIE_AUDIO_IDS,
    KIE_AUDIO_ID: process.env.KIE_AUDIO_ID,
    KIE_OMNI_FEMALE_AUDIO_IDS: process.env.KIE_OMNI_FEMALE_AUDIO_IDS,
    KIE_OMNI_FEMALE_AUDIO_ID: process.env.KIE_OMNI_FEMALE_AUDIO_ID,
    KIE_FEMALE_AUDIO_IDS: process.env.KIE_FEMALE_AUDIO_IDS,
    KIE_FEMALE_AUDIO_ID: process.env.KIE_FEMALE_AUDIO_ID,
    KIE_OMNI_MALE_AUDIO_IDS: process.env.KIE_OMNI_MALE_AUDIO_IDS,
    KIE_OMNI_MALE_AUDIO_ID: process.env.KIE_OMNI_MALE_AUDIO_ID,
    KIE_MALE_AUDIO_IDS: process.env.KIE_MALE_AUDIO_IDS,
    KIE_MALE_AUDIO_ID: process.env.KIE_MALE_AUDIO_ID,
  };

  clearEnv();
  process.env.KIE_OMNI_AUDIO_IDS = "voice_a, voice_b, voice_a";
  assert.deepEqual(resolveKieOmniAudioIds(), ["voice_a", "voice_b"]);

  clearEnv();
  assert.deepEqual(resolveKieOmniAudioIds({ data: { audio_ids: ["payload_voice"] } }), ["payload_voice"]);

  clearEnv();
  process.env.KIE_OMNI_FEMALE_AUDIO_ID = "female_voice";
  assert.equal(detectKieOmniVoiceGender({ prompt: "Женщина в домашней одежде говорит в камеру" }), "female");
  assert.deepEqual(resolveKieOmniAudioIds({ prompt: "Женщина в домашней одежде говорит в камеру" }), ["female_voice"]);

  clearEnv();
  process.env.KIE_OMNI_MALE_AUDIO_IDS = "male_voice, male_voice_2, male_voice";
  assert.equal(detectKieOmniVoiceGender({ prompt: "Мужчина в худи снимает UGC ролик" }), "male");
  assert.deepEqual(resolveKieOmniAudioIds({ prompt: "Мужчина в худи снимает UGC ролик" }), ["male_voice", "male_voice_2"]);

  clearEnv();
  assert.deepEqual(resolveKieOmniAudioIds({ gender: "male" }), []);

  clearEnv();
  assert.deepEqual(resolveKieOmniAudioIds({ gender: "female" }), ["4a786461922c4383a2010d9b8a4b4f33"]);

  clearEnv();
  assert.deepEqual(resolveKieOmniAudioIds(), ["4a786461922c4383a2010d9b8a4b4f33"]);

  restoreEnv(previous);
  console.log("KIE Omni audio id contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function clearEnv() {
  delete process.env.KIE_OMNI_AUDIO_IDS;
  delete process.env.KIE_OMNI_AUDIO_ID;
  delete process.env.KIE_AUDIO_IDS;
  delete process.env.KIE_AUDIO_ID;
  delete process.env.KIE_OMNI_FEMALE_AUDIO_IDS;
  delete process.env.KIE_OMNI_FEMALE_AUDIO_ID;
  delete process.env.KIE_FEMALE_AUDIO_IDS;
  delete process.env.KIE_FEMALE_AUDIO_ID;
  delete process.env.KIE_OMNI_MALE_AUDIO_IDS;
  delete process.env.KIE_OMNI_MALE_AUDIO_ID;
  delete process.env.KIE_MALE_AUDIO_IDS;
  delete process.env.KIE_MALE_AUDIO_ID;
}

function restoreEnv(previous) {
  clearEnv();
  for (const [key, value] of Object.entries(previous)) {
    if (value !== undefined) process.env[key] = value;
  }
}
