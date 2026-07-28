import { normalizeOmniGenerationProvider, type OmniGenerationProvider } from "@/lib/omni/provider";
import {
  createCometOmniVideoTask,
  downloadCometOmniVideo,
  retrieveCometOmniVideoTask,
} from "./comet-video-client";
import {
  createKieOmniVideoTask,
  downloadKieOmniVideo,
  retrieveKieOmniTask,
  type KieOmniTask,
} from "./kie-omni-client";

export type ProviderTask = Awaited<ReturnType<typeof createCometOmniVideoTask>> | KieOmniTask;

export async function createProviderVideoTask(input: {
  provider: OmniGenerationProvider;
  prompt: string;
  seconds: number;
  resolution: string;
  referenceImages: { url: string; role?: string }[];
  characterId: string | null;
  audioIds?: readonly string[];
}) {
  if (input.provider === "kie-ai") {
    const hasStoryboardReference = input.referenceImages.some((image) => image.role === "storyboard");
    if (!input.characterId && !hasStoryboardReference) throw new Error("KIE.ai Omni requires character id or storyboard reference");
    return createKieOmniVideoTask({
      prompt: input.prompt,
      duration: getProviderDuration(input.provider, input.seconds),
      aspectRatio: "9:16",
      resolution: input.resolution,
      imageUrls: input.referenceImages.map((image) => image.url),
      characterIds: input.characterId && !hasStoryboardReference ? [input.characterId] : [],
      audioIds: [...(input.audioIds || [])],
    });
  }

  return createCometOmniVideoTask({
    prompt: input.prompt,
    seconds: input.seconds,
    aspectRatio: "9:16",
    resolution: input.resolution,
    referenceImages: input.referenceImages,
  });
}

export async function retrieveProviderVideoTask(providerInput: unknown, taskId: string) {
  const provider = normalizeOmniGenerationProvider(providerInput);
  return provider === "kie-ai" ? retrieveKieOmniTask(taskId) : retrieveCometOmniVideoTask(taskId);
}

export async function downloadProviderVideo(providerInput: unknown, taskId: string) {
  const provider = normalizeOmniGenerationProvider(providerInput);
  return provider === "kie-ai" ? downloadKieOmniVideo(taskId) : downloadCometOmniVideo(taskId);
}

export function getProviderDuration(provider: OmniGenerationProvider, seconds: number): 4 | 6 | 8 | 10 {
  if (seconds <= 4) return 4;
  if (seconds <= 6) return 6;
  if (seconds <= 8) return 8;
  return 10;
}
