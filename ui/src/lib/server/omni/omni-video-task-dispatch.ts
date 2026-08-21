import { createKieOmniVideoTask } from "./kie-omni-client";
import {
  createProviderVideoTask,
  getProviderDuration,
  type ProviderTask,
} from "./omni-provider-tasks";

export async function createOmniVideoTask(input: {
  provider: "kie-ai" | "cometapi";
  avatarFreeReferenceScene: boolean;
  prompt: string;
  durationSeconds: number;
  resolution: string;
  referenceImages: Array<{ url: string; fieldName: string; role: string }>;
  imageUrls: string[];
  characterId: string | null;
  audioIds: string[];
}): Promise<ProviderTask> {
  if (input.provider === "kie-ai" && input.avatarFreeReferenceScene) {
    return createKieOmniVideoTask({
      prompt: input.prompt,
      duration: getProviderDuration(input.provider, input.durationSeconds),
      aspectRatio: "9:16",
      resolution: input.resolution,
      imageUrls: input.imageUrls,
      audioIds: input.audioIds,
    });
  }

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
