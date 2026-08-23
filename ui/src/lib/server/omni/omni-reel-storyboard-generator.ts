import pool from "@/lib/db";
import type { OmniSegmentPrompt } from "./omni-prompt-builder";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import type { DirectorBrief } from "./director-analysis-types";
import type { ReferenceSceneMode } from "./omni-reference-scene-mode";
import { generateStoryboardImage } from "./omni-storyboard-image-generator";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";

export async function reserveOmniReelId() {
  const { rows } = await pool.query<{ id: number }>(
    "SELECT nextval(pg_get_serial_sequence('omni_reels', 'id'))::int AS id"
  );
  const id = Number(rows[0]?.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Could not reserve Omni reel id");
  return id;
}

export async function generateStoryboardReferenceUrls(input: {
  projectId: number;
  productId: number;
  reelId: number;
  productName: string;
  productPhysicalContract?: string | null;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrlsBySegment?: ReadonlyMap<number, readonly string[]>;
  directorBrief?: DirectorBrief | null;
  avatarReferenceUrl: string | null;
  referenceSceneMode: ReferenceSceneMode;
  promptPlan: readonly OmniSegmentPrompt[];
  generationProvider?: OmniGenerationProvider;
}): Promise<(string | null)[]> {
  const urls: (string | null)[] = [];
  let canonicalStoryboardReferenceUrl: string | null = null;
  for (let index = 0; index < input.promptPlan.length; index += 1) {
    const segmentPrompt = input.promptPlan[index];
    if (index > 0 && !canonicalStoryboardReferenceUrl) {
      throw new Error("Storyboard 1 must be approved before generating later storyboard segments");
    }
    const storyboardReferenceUrl: string | null = segmentPrompt.storyboardPlan
      ? await generateStoryboardImage({
          projectId: input.projectId,
          productId: input.productId,
          reelId: input.reelId,
          segmentIndex: index + 1,
          storyboard: segmentPrompt.storyboardPlan,
          productName: input.productName,
          productPhysicalContract: segmentPrompt.creativePlan.productRole === "digital_demo" ? null : input.productPhysicalContract,
          productRole: segmentPrompt.creativePlan.productRole,
          productReferenceUrls: hasProductVisibleStoryboardFrame(segmentPrompt.storyboardPlan, input.productName)
            ? input.productReferenceUrls
            : [],
          directorReferenceImageUrls: Array.from(input.directorReferenceImageUrlsBySegment?.get(segmentPrompt.index) || []),
          referenceSegmentPlan: segmentPrompt.referenceSegmentPlan,
          avatarReferenceUrl: input.avatarReferenceUrl,
          canonicalStoryboardReferenceUrl,
          directorBrief: input.directorBrief,
          referenceSceneMode: input.referenceSceneMode,
          generationProvider: input.generationProvider,
        })
      : null;
    urls.push(storyboardReferenceUrl);
    if (index === 0 && storyboardReferenceUrl) canonicalStoryboardReferenceUrl = storyboardReferenceUrl;
  }
  return urls;
}
