import {
  uploadOmniGeneratedScriptStoryboardImageBufferToS3,
  uploadOmniImageBufferToS3,
} from "./omni-video-storage";

type StoryboardImageStorageInput = {
  projectId: number;
  reelId?: number;
  scriptId?: number;
  segmentIndex: number;
  generationAttemptCount: number;
  generationToken: string;
  body: Buffer;
  contentType: string;
};

export async function uploadVersionedStoryboardImage(input: StoryboardImageStorageInput) {
  return uploadStoryboardImage(input, "storyboard");
}

export async function uploadStoryboardRepairCandidate(input: StoryboardImageStorageInput) {
  return uploadStoryboardImage(input, "repair_candidate");
}

async function uploadStoryboardImage(input: StoryboardImageStorageInput, kind: "storyboard" | "repair_candidate") {
  const fileName = buildStoryboardImageFileName(input, kind);
  if (typeof input.reelId === "number") {
    return uploadOmniImageBufferToS3({
      projectId: input.projectId,
      reelId: input.reelId,
      segmentIndex: input.segmentIndex,
      fileName,
      body: input.body,
      contentType: input.contentType,
    });
  }
  if (typeof input.scriptId === "number") {
    return uploadOmniGeneratedScriptStoryboardImageBufferToS3({
      projectId: input.projectId,
      scriptId: input.scriptId,
      segmentIndex: input.segmentIndex,
      fileName,
      body: input.body,
      contentType: input.contentType,
    });
  }
  throw new Error("Storyboard image generation requires reelId or scriptId storage target");
}

export function buildStoryboardImageFileName(
  input: Pick<StoryboardImageStorageInput, "segmentIndex" | "generationAttemptCount" | "generationToken" | "contentType">,
  kind: "storyboard" | "repair_candidate"
) {
  const extension = input.contentType.split("/")[1] || "jpg";
  const segment = String(input.segmentIndex).padStart(2, "0");
  const attempt = String(Math.max(1, Math.trunc(input.generationAttemptCount))).padStart(2, "0");
  const token = sanitizeStorageToken(input.generationToken);
  return `${kind}_${segment}_attempt_${attempt}_${token}.${extension}`;
}

function sanitizeStorageToken(value: string) {
  const token = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120);
  if (!token) throw new Error("Storyboard image storage requires a generation token");
  return token;
}
