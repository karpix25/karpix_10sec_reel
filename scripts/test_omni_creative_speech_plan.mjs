import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-writer-speech-"));
const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const originalFetch = global.fetch;
const passingReview = {
  version: "script-semantic-review-v2", passed: true,
  productNamed: true, productValueStated: true, hookAnswered: true, finalAnswerPresent: true,
  referenceMeaningPreserved: true, productNaturallyIntegrated: true,
  evidence: { product: "", value: "", answer: "", transition: "" },
  defects: [], warnings: [], issues: [], repairInstructions: [],
};
const input = {
  model: "local/mock", projectName: "Speech test", productName: "Плати по миру виртуальная карта",
  productDescription: "Оплата покупок за границей.", productReferenceNotes: null,
  targetAudience: null, brandVoice: null, ctaMode: "no_explicit_cta", ctaValue: null,
  avatarSpeechGender: "male", adaptationPlan: { mode: "writer_owned" },
  sourceScenario: { script: "Сегодня я расскажу про поездку на остров Палау." },
};
const groups = [
  { durationSeconds: 4, voiceover: input.sourceScenario.script },
  { durationSeconds: 6, voiceover: "Плати по миру виртуальная карта помогает оплачивать покупки за границей." },
];
const script = groups.map((group) => group.voiceover).join(" ");
const json = (segments) => JSON.stringify({ segments: segments.map(({ durationSeconds, voiceover }) => ({ duration_seconds: durationSeconds, voiceover })) });
let reviews = 0;
try {
  global.fetch = async () => { throw new Error("Paid/network calls forbidden in this test"); };
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2022", module: "commonjs", moduleResolution: "node", jsx: "react-jsx",
      rootDir: join(ui, "src"), outDir: output, baseUrl: join(ui, "src"), paths: { "@/*": ["*"] },
      strict: true, esModuleInterop: true, skipLibCheck: true,
      types: ["node"], typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [join(ui, "src/lib/server/omni/llm-creative-copywriter.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });
  Module._load = function (request, parent, isMain) {
    if (request === "./script-semantic-reviewer") return {
      reviewScriptSemantics: async () => { reviews += 1; return passingReview; },
      assertScriptSemanticReviewPassed: (review) => assert.equal(review.passed, true),
    };
    if (request.startsWith("@/")) return originalLoad.call(this, join(output, request.slice(2)), parent, isMain);
    return originalLoad.call(this, request, parent, isMain);
  };
  const { validateCreativeSpeechPlan } = require(join(output, "lib/server/omni/creative-speech-plan.js"));
  const { runCreativeCopywriter, CreativeCopywriterFailure } = require(join(output, "lib/server/omni/llm-creative-copywriter.js"));
  const { normalizeCreativeScriptDraft } = require(join(output, "lib/server/omni/llm-prompt-chain-normalizer.js"));
  const plan = validateCreativeSpeechPlan(script, groups);
  assert.deepEqual(plan.segments.map((segment) => segment.text), groups.map((group) => group.voiceover));
  assert.deepEqual(plan.segmentDurationsSeconds, [4, 6]);
  assert.deepEqual(validateCreativeSpeechPlan(script, groups.map((group) => ({ ...group, durationSeconds: 10 }))).segmentDurationsSeconds,
    [4, 6], "Code computes durations without stretching speech or spending another author request");
  assert.throws(() => validateCreativeSpeechPlan(`${script} Лишнее.`, groups), /без пропусков/u);
  const fragment = [{ ...groups[0], voiceover: groups[0].voiceover.replace(/\.$/u, ",") }, groups[1]];
  assert.throws(() => validateCreativeSpeechPlan(fragment.map((group) => group.voiceover).join(" "), fragment), /законченным предложением/u);
  const six = Array(6).fill(groups[0]);
  assert.throws(() => validateCreativeSpeechPlan(six.map((group) => group.voiceover).join(" "), six), /от 2 до 5/u);
  assert.equal(normalizeCreativeScriptDraft(json(groups)).script, script);
  const requests = [];
  const invalidGroups = [{ durationSeconds: 10, voiceover: `${Array(21).fill("слово").join(" ")}.` }, groups[1]];
  const result = await runCreativeCopywriter(input, () => {}, async (request) => {
    requests.push(request);
    return json(request.attempt === 1 ? invalidGroups : groups);
  });
  assert.equal(requests.length, 2);
  assert.equal(reviews, 2, "Both local timing and semantic review run before the sole repair");
  assert.match(requests[1].userPrompt, /21 слов/u);
  assert.equal(result.draft.script, script);
  assert.deepEqual(result.segmentPlan.segments.map((segment) => segment.text), groups.map((group) => group.voiceover));
  assert.equal(result.diagnostics[0].script, invalidGroups.map((group) => group.voiceover).join(" "));
  assert.deepEqual(result.diagnostics[0].speechSegments, invalidGroups);
  assert.deepEqual(result.diagnostics[0].semanticReview, passingReview);
  const fragmentedGroups = [
    { durationSeconds: 4, voiceover: "Сегодня я расскажу про поездку на остров" },
    { durationSeconds: 6, voiceover: "Палау. Плати по миру виртуальная карта помогает оплачивать покупки за границей." },
  ];
  const fragmentRequests = [];
  const recoveredFragment = await runCreativeCopywriter(input, () => {}, async (request) => {
    fragmentRequests.push(request);
    return json(fragmentedGroups);
  });
  assert.equal(fragmentRequests.length, 1, "planner must repair a writer's fragment without another LLM call");
  assert.deepEqual(recoveredFragment.segmentPlan.segments.map((segment) => segment.text), groups.map((group) => group.voiceover));
  const numbered = await runCreativeCopywriter(input, () => {}, async () => json([
    { durationSeconds: 6, voiceover: "Сегодня поездка на остров Палау стоит ровно 1200 рублей." }, groups[1],
  ]));
  assert.doesNotMatch(numbered.draft.script, /\d/u);
  assert.equal(numbered.draft.script, numbered.draft.speechSegments.map((group) => group.voiceover).join(" "),
    "Number normalization must apply to canonical speech groups and full script together");
  let calls = 0;
  await assert.rejects(runCreativeCopywriter(input, () => {}, async () => {
    calls += 1;
    return json(invalidGroups);
  }), (error) => error instanceof CreativeCopywriterFailure && error.partialSnapshot.creativeAttemptDiagnostics.length === 2);
  assert.equal(calls, 2, "No unbounded repair loop");
  await assert.rejects(runCreativeCopywriter(input, () => {}, async ({ attempt }) => {
    if (attempt === 2) throw new Error("request unavailable");
    return json(invalidGroups);
  }), (error) => {
    assert.equal(error.partialSnapshot.semanticReview, undefined, "Failed request must not retain prior candidate review as current");
    assert.deepEqual(error.partialSnapshot.creativeAttemptDiagnostics[0].semanticReview, passingReview);
    return true;
  });
  console.log("Creative speech plan: exact boundaries, density, complete sentences, two-attempt repair and retained diagnostics passed.");
} finally {
  Module._load = originalLoad;
  global.fetch = originalFetch;
  rmSync(output, { recursive: true, force: true });
}
