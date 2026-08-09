import { normalizeOmniGenerationProvider } from "@/lib/omni/provider";
import { ensureOmniScriptCta } from "./omni-cta-contract";
import { resolveGeneratedScriptDirectorContext } from "./generated-script-director-context";
import { getGeneratedScript } from "./generated-scripts";
import { getLatestOmniClientAvatar } from "./avatars";
import { getOmniProject } from "./projects";
import { requireOmniProductInProject } from "./products";
import { requireAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import { resolveOmniDurationRange } from "./omni-duration-settings";
import { planOmniReelSegments } from "./omni-duration-planner";
import { compactOmniGeneratedScript } from "./omni-script-compactor";

export async function assertOmniProductionPreflight(input: {
  projectId: number;
  productId: number;
  generatedScriptId?: number | null;
  provider?: unknown;
}) {
  const project = await getOmniProject(input.projectId);
  if (!project) throw new Error("Production preflight blocked: Omni project not found");

  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const provider = normalizeOmniGenerationProvider(input.provider);
  if (!input.generatedScriptId) {
    return { provider, scriptId: null, wordCount: null, segmentCount: null };
  }

  const avatar = await getLatestOmniClientAvatar(input.projectId);
  const avatarSpeechGender = requireAvatarSpeechGender(avatar?.speech_gender);
  if (provider === "kie-ai" && !avatar?.kie_character_id) {
    throw new Error("Production preflight blocked: KIE.ai requires an approved avatar with saved character id");
  }

  const generatedScript = await getGeneratedScript({
    projectId: input.projectId,
    productId: input.productId,
    scriptId: input.generatedScriptId,
  });
  if (!generatedScript) {
    throw new Error("Production preflight blocked: generated script not found for this product");
  }

  const resolvedScript = {
    ...generatedScript,
    script: ensureOmniScriptCta(generatedScript.script, product.cta_mode, product.cta_value),
  };
  const durationRange = await resolveOmniDurationRange({ project, product });
  let segmentPlan;
  try {
    segmentPlan = planOmniReelSegments(resolvedScript.script, { durationRange });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isCompactionCandidate(message)) {
      throw new Error(`Production preflight blocked: ${message}`);
    }
    segmentPlan = await compactOmniGeneratedScript({
      generatedScript,
      productName: product.name,
      ctaMode: product.cta_mode,
      ctaValue: product.cta_value,
      avatarSpeechGender,
      durationRange,
    });
  }

  await resolveGeneratedScriptDirectorContext({ generatedScript: resolvedScript });

  return {
    provider,
    scriptId: generatedScript.id,
    wordCount: segmentPlan.wordCount,
    segmentCount: segmentPlan.segmentCount,
  };
}

function isCompactionCandidate(message: string) {
  return /Сценарий не помещается в доступные Omni-длительности|Не удалось разделить сценарий/iu.test(message);
}
