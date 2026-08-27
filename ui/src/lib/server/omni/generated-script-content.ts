import type { OmniLegacyScenario } from "@/lib/omni/types";
import { summarizeOpenRouterUsage } from "@/lib/omni/openrouter-cost";
import { analyzeScriptContentAndAdapt } from "./openrouter-script-content-adapter";
import { IncompatibleReferenceError } from "./script-content-contract";
import { updateGeneratedScriptGenerationSnapshot } from "./generated-script-generation-state";

export function resolveGeneratedScriptReferenceTranscript(
  sourceScenario: OmniLegacyScenario,
  directorSourceSnapshot: Record<string, unknown> | null | undefined,
) {
  const storedTranscript = directorSourceSnapshot?.reference_transcript;
  if (typeof storedTranscript === "string" && storedTranscript.trim()) return storedTranscript.trim();
  return sourceScenario.script.trim();
}

export async function prepareGeneratedScriptContent(input: {
  scriptId: number;
  sourceScenario: OmniLegacyScenario;
  referenceTranscript: string;
  productName: string;
  productDescription: string | null;
  productReferenceNotes: string | null;
  model: string;
}) {
  const contentAdaptation = await analyzeScriptContentAndAdapt({
    transcript: input.referenceTranscript,
    title: input.sourceScenario.title,
    topic: input.sourceScenario.topic,
    productName: input.productName,
    productDescription: input.productDescription,
    productReferenceNotes: input.productReferenceNotes,
    model: input.model,
  });
  await updateGeneratedScriptGenerationSnapshot(input.scriptId, {
    content_contract: contentAdaptation.contract,
    content_adaptation_plan: contentAdaptation.contract.adaptation,
    content_adapter_model: contentAdaptation.model,
    content_adapter_prompt_version: contentAdaptation.promptVersion,
    reference_transcript: input.referenceTranscript,
    openrouter_usage: [contentAdaptation.openRouterUsage],
    openrouter_cost: summarizeOpenRouterUsage([contentAdaptation.openRouterUsage]),
  });
  if (contentAdaptation.contract.adaptation.mode === "incompatible") {
    throw new IncompatibleReferenceError(contentAdaptation.contract);
  }
  return contentAdaptation;
}
