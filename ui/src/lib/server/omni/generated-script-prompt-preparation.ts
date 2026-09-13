import type { OmniPromptPreviewSegment } from "@/lib/omni/types";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import { getGeneratedScript } from "./generated-scripts";
import { requireOmniProductInProject } from "./products";
import { getOmniProject } from "./projects";
import { getLatestOmniClientAvatar } from "./avatars";
import { resolveOmniDurationRange } from "./omni-duration-settings";
import { resolveOmniTimedVoiceoverPlan } from "./omni-timed-voiceover-plan";
import { OMNI_SEGMENT_SECONDS } from "./omni-duration-planner";
import { extractDirectorBriefFromSnapshot } from "./director-analysis-types";
import { readSourceDurationSeconds } from "./storyboard-reference-frame-timing";
import { prepareOmniPromptPlan, readPreparedOmniPromptPlan, type OmniPromptPreparationInput } from "./omni-prompt-preparation";
import { adaptDirectorBriefForAvatarReel } from "./omni-avatar-reel-plan";

type ScriptPromptInput = {
  projectId: number;
  productId: number;
  scriptId: number;
  generationProvider?: OmniGenerationProvider;
};

export async function getGeneratedScriptPromptPreview(input: ScriptPromptInput): Promise<OmniPromptPreviewSegment[]> {
  const context = await loadGeneratedScriptPromptContext(input);
  const plan = await readPreparedOmniPromptPlan(context);
  if (!plan) return [];
  return plan.map((segment) => ({
    segmentIndex: segment.index, durationSeconds: segment.durationSeconds, role: segment.role,
    prompt: segment.prompt, referenceUrl: segment.referenceUrl, voiceoverText: segment.voiceoverText,
    creativeStrategy: segment.creativeStrategy, creativePlan: segment.creativePlan,
    storyboardPlan: segment.storyboardPlan, storyboardValidation: segment.storyboardValidation,
    storyboardReferenceUrl: null, validation: segment.validation,
  }));
}

export async function prepareGeneratedScriptPromptPlan(input: ScriptPromptInput) {
  return prepareOmniPromptPlan(await loadGeneratedScriptPromptContext(input));
}

async function loadGeneratedScriptPromptContext(input: ScriptPromptInput): Promise<OmniPromptPreparationInput> {
  const generatedScript = await getGeneratedScript(input);
  if (!generatedScript) throw new Error("Generated script not found for this product");
  const [product, project, avatar] = await Promise.all([
    requireOmniProductInProject(input.projectId, input.productId),
    getOmniProject(input.projectId), getLatestOmniClientAvatar(input.projectId),
  ]);
  if (!project) throw new Error("Omni project not found");
  const durationRange = await resolveOmniDurationRange({ project, product, legacyClientId: generatedScript.source_legacy_client_id });
  const timedVoiceoverPlan = resolveOmniTimedVoiceoverPlan({ script: generatedScript.script, sourceSnapshot: generatedScript.source_snapshot, durationRange });
  return {
    projectId: input.projectId, productId: input.productId,
    generatedScript, product, avatar, legacyTranscript: null,
    segmentCount: timedVoiceoverPlan.segmentCount, segmentSeconds: OMNI_SEGMENT_SECONDS,
    timedVoiceoverPlan, brief: null, targetAudience: project.target_audience,
    ctaMode: product.cta_mode, ctaValue: product.cta_value, wardrobeSource: project.wardrobe_source,
    directorBrief: adaptDirectorBriefForAvatarReel(extractDirectorBriefFromSnapshot(generatedScript.source_snapshot)),
    referenceSourceDurationSeconds: readSourceDurationSeconds(generatedScript.source_snapshot),
  };
}
