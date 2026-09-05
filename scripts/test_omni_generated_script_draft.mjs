import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const ts = require(resolve(root, "ui/node_modules/typescript"));
const originalLoad = Module._load;
const calls = [];
const mocks = {};
let row = { status: "draft", script: "Сохранённый текст.", source_snapshot: {} };
const db = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: row ? [row] : [] }; } };
class ChainFailure extends Error { constructor(script) { super("failed check"); this.partialSnapshot = { creativeScriptDraft: { script } }; this.stage = "creative_copywriter"; } }
class ValidationFailure extends Error { constructor(script) { super("failed local check"); this.script = script; } }
function load(name) {
  const filename = resolve(root, "ui/src/lib/server/omni", `${name}.ts`);
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(resolve(root, "ui"));
  compiled._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
  return compiled.exports;
}
try {
  Module._load = function (request, parent, isMain) {
    if (request in mocks) return mocks[request];
    if (request === "@/lib/db") return db;
    if (request === "./llm-prompt-chain-runner") return { LlmPromptChainFailure: ChainFailure };
    if (request === "./creative-script-preflight") return { CreativeScriptValidationError: ValidationFailure };
    return originalLoad.call(this, request, parent, isMain);
  };
  const gate = load("generated-script-readiness");
  gate.assertGeneratedScriptReady(row); // Legacy validated drafts remain usable.
  gate.assertGeneratedScriptReady({ ...row, status: "approved" });
  for (const invalid of [
    { ...row, source_snapshot: { generation_error: "Lost answer" } },
    { ...row, source_snapshot: { semantic_review: { passed: false } } },
    { ...row, source_snapshot: { quality_check: { passed: false } } },
    { ...row, status: "generating" }, { ...row, status: "failed" }, { ...row, script: " " },
  ]) assert.throws(() => gate.assertGeneratedScriptReady(invalid), /Сценарий требует исправления/);
  const scope = { scriptId: 1, projectId: 2, productId: 3 };
  await gate.assertStoredGeneratedScriptReady({ ...scope, expectedScript: row.script });
  assert.deepEqual(calls.at(-1).values, [1, 2, 3]);
  await assert.rejects(gate.assertStoredGeneratedScriptReady({ ...scope, expectedScript: "old" }), /Сценарий изменился/);
  row = null;
  await assert.rejects(gate.assertStoredGeneratedScriptReady(scope), /не найден/);
  const state = load("generated-script-generation-state");
  for (const failure of [new ChainFailure("Editable text."), new ValidationFailure("Editable text.")]) {
    await state.failGeneratedScriptGeneration(1, failure);
    assert.equal(calls.at(-1).values[2], "Editable text.");
    assert.equal(calls.at(-1).values[3], "draft");
    assert.ok(JSON.parse(calls.at(-1).values[1]).generation_error);
  }
  await state.failGeneratedScriptGeneration(1, new Error("transport failed"));
  assert.equal(calls.at(-1).values[3], "failed");
  const saved = { id: 1, status: "draft", script: "Old text.", source_legacy_scenario_id: 9, source_snapshot: {
    transcript: "Reference answer.", llm_prompt_chain: { stale: true }, generated_script_plan: { stale: true },
  }, updated_at: "2026-09-01" };
  let evaluation = { issues: ["Missing answer"], preflight: { qualityCheck: { passed: true }, segmentPlan: { segments: [] } }, semanticReview: { passed: false } };
  let evaluatedText;
  Object.assign(mocks, {
    "./generated-scripts": { getGeneratedScript: async () => saved },
    "./projects": { getOmniProject: async () => ({ name: "Project" }) },
    "./products": { requireOmniProductInProject: async () => ({ name: "Product" }) },
    "./avatars": { getLatestOmniClientAvatar: async () => ({ speech_gender: "male" }) },
    "./legacy-scenarios": { getLegacyScenario: async () => ({ script: "Fallback reference" }) },
    "./omni-duration-settings": { resolveOmniDurationRange: async () => ({}) },
    "../../omni/avatar-speech-gender": { resolveNarratorSpeechGender: (gender) => gender },
    "./director-analysis-types": { extractDirectorBriefFromSnapshot: () => null },
    "./script-content-contract": { buildWriterOwnedScriptContentContract: () => ({ adaptation: {} }) },
    "./llm-creative-copywriter": { evaluateCreativeScriptDraft: async (input, text) => {
      assert.equal(input.sourceScenario.script, "Reference answer."); evaluatedText = text; return evaluation;
    } },
    "./omni-timed-voiceover-plan": { buildOmniTimedVoiceoverPlanFromSegments: (plan) => {
      assert.equal(plan, evaluation.preflight.segmentPlan); return { script: evaluatedText };
    } },
  });
  let rejectEdit = false;
  db.connect = async () => ({
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("pg_try_advisory")) return { rows: [{ ready: true }] };
      if (sql.startsWith("UPDATE")) return { rows: rejectEdit ? [] : [{ script: values[3], source_snapshot: JSON.parse(values[4]) }] };
      return { rows: [] };
    },
    release() {},
  });
  const edit = load("generated-script-edit").editGeneratedScript;
  const edited = await edit({ ...scope, script: "Exact edited text." });
  assert.equal(evaluatedText, "Exact edited text.");
  assert.equal(edited.script, evaluatedText);
  assert.equal(edited.source_snapshot.generation_error, "Missing answer");
  assert.equal(edited.source_snapshot.llm_prompt_chain, undefined);
  assert.equal(edited.source_snapshot.generated_script_plan, undefined);
  assert.equal(edited.source_snapshot.timed_voiceover_plan, null);
  assert.ok(calls.some(({ sql }) => sql.startsWith("DELETE FROM omni_generated_script_storyboards")));
  evaluation = { ...evaluation, issues: [], semanticReview: { passed: true } };
  const passed = await edit({ ...scope, script: "Corrected text." });
  assert.equal(passed.source_snapshot.generation_error, null);
  assert.equal(passed.source_snapshot.generation_stage, "completed");
  assert.equal(passed.source_snapshot.timed_voiceover_plan.script, "Corrected text.");
  rejectEdit = true;
  await assert.rejects(edit({ ...scope, script: "Conflicting text." }), /Сценарий изменился/);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
  await assert.rejects(edit({ ...scope, script: " " }), /нужен текст/);
  row = { id: 22 };
  const previousEvaluation = evaluatedText;
  await assert.rejects(edit({ ...scope, script: "Already used text." }), /уже используется/);
  assert.equal(evaluatedText, previousEvaluation, "linked reels must be detected before calling the text reviewer");
  console.log("PASS: editable failed drafts, readiness checks, scope and stale-text guards");
} finally { Module._load = originalLoad; }
