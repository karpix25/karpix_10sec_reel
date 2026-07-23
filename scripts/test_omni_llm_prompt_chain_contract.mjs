import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-llm-chain-"));
const require = createRequire(import.meta.url);

function findFile(base, filename) {
  const queue = [base];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      if (entry.isFile() && entry.name === filename) return fullPath;
    }
  }
  throw new Error(`File ${filename} not found in ${base}`);
}

try {
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/provider-prompt-contract-validator.ts",
      "src/lib/server/omni/llm-prompt-chain-normalizer.ts",
      "src/lib/server/omni/llm-prompt-chain-number-words.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const validator = require(findFile(output, "provider-prompt-contract-validator.js"));
  const normalizer = require(findFile(output, "llm-prompt-chain-normalizer.js"));
  const numberWords = require(findFile(output, "llm-prompt-chain-number-words.js"));

  const directorPlan = makeDirectorPlan();
  const providerPlan = makeProviderPlan();

  assert.deepEqual(validator.validateDirectorSegmentPlan(directorPlan), []);
  assert.deepEqual(validator.validateProviderPromptPlan(providerPlan), []);

  const normalizedProvider = normalizer.normalizeProviderPromptPlan({
    segment_prompts: [
      {
        index: 1,
        duration_seconds: 8,
        voiceover: providerPlan.segmentPrompts[0].voiceover,
        reference_role: "avatar",
        prompt: providerPlan.segmentPrompts[0].prompt,
      },
    ],
  });
  assert.equal(normalizedProvider.segmentPrompts[0].durationSeconds, 8);
  assert.equal(normalizedProvider.segmentPrompts[0].referenceRole, "avatar");
  assert.equal(numberWords.formatPromptChainRange(60, 72), "от шестидесяти до семидесяти двух");
  assert.ok(!/[\d-]/u.test(numberWords.formatPromptChainRange(60, 72)));

  assertIssue(
    validator.validateDirectorSegmentPlan({
      ...directorPlan,
      segments: [
        {
          ...directorPlan.segments[0],
          shots: [
            directorPlan.segments[0].shots[0],
            { role: "cutaway", action: "Миша смотрит в камеру и улыбается" },
            directorPlan.segments[0].shots[2],
          ],
        },
      ],
    }),
    "cutaway_faces_camera"
  );

  assertIssue(
    validator.validateDirectorSegmentPlan({
      ...directorPlan,
      segments: [
        {
          ...directorPlan.segments[0],
          productState: "аэрогриль на столе, Миша держит его в руках",
        },
      ],
    }),
    "product_state_conflict"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [
        {
          ...providerPlan.segmentPrompts[0],
          prompt: "Аэрогриль стоит на столе без рук, затем рука берет его и поворачивает.",
        },
      ],
    }),
    "hands_conflict"
  );

  assertIssue(
    validator.validateDirectorSegmentPlan({
      ...directorPlan,
      segments: [{ ...directorPlan.segments[0], voiceover: "С этим аэрогрилем вы сможете" }],
    }),
    "bad_speech_boundary"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{ ...providerPlan.segmentPrompts[0], prompt: "Кадр 1 с улыбкой" }],
    }),
    "digit"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{ ...providerPlan.segmentPrompts[0], prompt: "Живой кадр — без паузы" }],
    }),
    "dash"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{ ...providerPlan.segmentPrompts[0], prompt: "Живой кадр 🔥" }],
    }),
    "emoji"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{ ...providerPlan.segmentPrompts[0], prompt: "Вертикальное живое видео. Миша улыбается." }],
    }),
    "prompt_voiceover_occurrence"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{
        ...providerPlan.segmentPrompts[0],
        prompt: `${providerPlan.segmentPrompts[0].prompt} Субтитры не нужны.`,
      }],
    }),
    "subtitle_overlay_cue"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{
        ...providerPlan.segmentPrompts[0],
        prompt: `${providerPlan.segmentPrompts[0].prompt} Instagram style.`,
      }],
    }),
    "platform_ui_cue"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [
        {
          ...providerPlan.segmentPrompts[0],
          prompt: `${providerPlan.segmentPrompts[0].prompt} Следующая фраза: Второй сегмент звучит отдельно.`,
        },
        {
          index: 2,
          durationSeconds: 8,
          voiceover: "Второй сегмент звучит отдельно.",
          referenceRole: "avatar",
          prompt: "Миша возвращается к лицу. Речь звучит точно: Второй сегмент звучит отдельно.",
        },
      ],
    }),
    "neighbor_voiceover_leak"
  );

  console.log("LLM prompt chain contract checks passed!");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function makeDirectorPlan() {
  return {
    version: "llm-prompt-chain-v1",
    format: "talking_head_cutaways",
    title: "Живой тест",
    hookOptions: ["Устал от долгой готовки?", "Хочется проще?", "Готовка может быть легче"],
    selectedHook: "Устал от долгой готовки?",
    totalVoiceover: "Устал от долгой готовки? Аэрогриль помогает сделать ужин проще и чище.",
    segments: [
      {
        index: 1,
        durationSeconds: 8,
        voiceover: "Устал от долгой готовки? Аэрогриль помогает сделать ужин проще и чище.",
        productState: "аэрогриль стоит на столе без рук",
        shots: [
          { role: "face_open", action: "Миша говорит в камеру энергично" },
          { role: "cutaway", action: "аэрогриль стоит на столе без рук" },
          { role: "face_return", action: "Миша возвращается к лицу и заканчивает мысль" },
        ],
        endState: "Миша смотрит в камеру, аэрогриль остается на столе",
      },
    ],
    notes: "Структура держит лицо, середину и возврат.",
  };
}

function makeProviderPlan() {
  return {
    version: "llm-prompt-chain-v1",
    format: "talking_head_cutaways",
    segmentPrompts: [
      {
        index: 1,
        durationSeconds: 8,
        voiceover: "Устал от долгой готовки? Аэрогриль помогает сделать ужин проще и чище.",
        referenceRole: "avatar",
        prompt:
          "Вертикальное живое видео. Миша начинает с лица в камеру. В середине короткая перебивка: аэрогриль стоит на столе без рук. Затем возврат к лицу. Речь звучит точно: Устал от долгой готовки? Аэрогриль помогает сделать ужин проще и чище.",
      },
    ],
    notes: "Готовый цельный prompt.",
  };
}

function assertIssue(issues, code) {
  assert(
    issues.some((issue) => issue.code === code),
    `Expected issue ${code}, got ${JSON.stringify(issues)}`
  );
}
