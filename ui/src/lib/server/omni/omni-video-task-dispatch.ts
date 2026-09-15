import {
  createProviderVideoTask,
  type ProviderTask,
} from "./omni-provider-tasks";

export async function createOmniVideoTask(input: {
  provider: "kie-ai" | "cometapi";
  prompt: string;
  durationSeconds: number;
  resolution: string;
  referenceImages: Array<{ url: string; fieldName: string; role: string }>;
  imageUrls: string[];
  characterId: string | null;
  audioIds: string[];
}): Promise<ProviderTask> {
  return createProviderVideoTask({
    provider: input.provider,
    prompt: input.prompt,
    seconds: input.durationSeconds,
    resolution: input.resolution,
    referenceImages: input.referenceImages,
    characterId: input.characterId,
    audioIds: input.audioIds,
  });
}
