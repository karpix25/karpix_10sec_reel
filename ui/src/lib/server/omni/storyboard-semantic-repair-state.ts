import { createHash } from "node:crypto";

export const MAX_LOCAL_SEMANTIC_REPAIR_ATTEMPTS = 2;
export const MAX_FULL_SEMANTIC_REBUILD_ATTEMPTS = 1;
export const MAX_SEMANTIC_REPAIR_LLM_CALLS = 7;

export type StoryboardSemanticRepairPhase = "local_repair" | "full_rebuild" | "final_review";

export type StoryboardSemanticRepairState = {
  phase: StoryboardSemanticRepairPhase;
  localRepairAttempts: number;
  fullRebuildAttempts: number;
  llmCalls: number;
  fullRebuildInputFingerprints: string[];
};

export type StoryboardPlanFingerprintInput = {
  index: number;
  durationSeconds: number;
  voiceoverText: string;
  storyboardPlan: unknown;
};

export function createStoryboardSemanticRepairState(): StoryboardSemanticRepairState {
  return {
    phase: "local_repair",
    localRepairAttempts: 0,
    fullRebuildAttempts: 0,
    llmCalls: 0,
    fullRebuildInputFingerprints: [],
  };
}

export function consumeSemanticRepairLlmCall(state: StoryboardSemanticRepairState) {
  if (state.llmCalls >= MAX_SEMANTIC_REPAIR_LLM_CALLS) {
    throw new Error(`Storyboard semantic repair exceeded its ${MAX_SEMANTIC_REPAIR_LLM_CALLS}-call budget`);
  }
  state.llmCalls += 1;
}

export function recordLocalSemanticRepair(state: StoryboardSemanticRepairState) {
  if (state.phase !== "local_repair" || state.localRepairAttempts >= MAX_LOCAL_SEMANTIC_REPAIR_ATTEMPTS) {
    throw new Error("Storyboard semantic repair local phase is exhausted");
  }
  state.localRepairAttempts += 1;
}

export function beginFullSemanticRebuild(state: StoryboardSemanticRepairState, inputFingerprint: string) {
  if (state.phase !== "local_repair" || state.fullRebuildAttempts >= MAX_FULL_SEMANTIC_REBUILD_ATTEMPTS) return false;
  if (state.fullRebuildInputFingerprints.includes(inputFingerprint)) return false;
  state.phase = "full_rebuild";
  state.fullRebuildAttempts += 1;
  state.fullRebuildInputFingerprints.push(inputFingerprint);
  return true;
}

export function beginFinalSemanticReview(state: StoryboardSemanticRepairState) {
  if (state.phase !== "full_rebuild") throw new Error("Storyboard semantic repair cannot enter final review");
  state.phase = "final_review";
}

export function fingerprintStoryboardPlan(plan: readonly StoryboardPlanFingerprintInput[]) {
  const canonicalPlan = plan
    .map(({ index, durationSeconds, voiceoverText, storyboardPlan }) => ({
      index,
      durationSeconds,
      voiceoverText,
      storyboardPlan,
    }))
    .sort((left, right) => left.index - right.index);
  return createHash("sha256").update(stableSerialize(canonicalPlan)).digest("hex");
}

export function formatSemanticRepairFailure(
  state: StoryboardSemanticRepairState,
  issueCodes: readonly string[],
  details: string,
) {
  return [
    `Storyboard semantic repair exhausted in phase ${state.phase}`,
    `after ${state.llmCalls}/${MAX_SEMANTIC_REPAIR_LLM_CALLS} LLM calls`,
    `local repairs ${state.localRepairAttempts}/${MAX_LOCAL_SEMANTIC_REPAIR_ATTEMPTS}`,
    `full rebuilds ${state.fullRebuildAttempts}/${MAX_FULL_SEMANTIC_REBUILD_ATTEMPTS}`,
    `issue_codes=${issueCodes.join(",")}`,
    details,
  ].join("; ");
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
}
