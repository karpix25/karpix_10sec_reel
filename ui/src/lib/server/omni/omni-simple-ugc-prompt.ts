import type {
  OmniCreativeStrategy,
  OmniSegmentCreativePlan,
} from "@/lib/omni/creative-contract";
import type { OmniCharacterContract } from "./omni-character-contract";
import type { DirectorBrief } from "./director-analysis-types";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import type { OmniGenerationContinuityDirection } from "./omni-generation-continuity";
import type { OmniWardrobeSource } from "../../omni/wardrobe-source";
import { renderCompactSegmentPrompt } from "./omni-compact-segment-prompt";

export function renderSimpleFullBodyUgcPrompt(input: {
  plan: OmniSegmentCreativePlan;
  strategy: OmniCreativeStrategy;
  characterContract: OmniCharacterContract;
  productName: string;
  productVisualPassport?: string | null;
  productPhysicalityContract?: string | null;
  segmentIndex: number;
  segmentCount: number;
  directorGuidance?: string | null;
  directorBrief?: DirectorBrief | null;
  referencePolicy?: ReferenceTransferPolicy;
  wardrobeSource?: OmniWardrobeSource;
  continuityDirection?: OmniGenerationContinuityDirection;
  segmentStartSeconds?: number;
  segmentEndSeconds?: number;
}) {
  const referencePolicy = input.referencePolicy || { mode: "full_reference" as const, omitRawDirectorGuidance: false };
  const duration = input.plan.beats[input.plan.beats.length - 1]?.endSeconds || 10;
  const segmentStartSeconds = input.segmentStartSeconds ?? (input.segmentIndex - 1) * duration;
  return renderCompactSegmentPrompt({
    plan: input.plan,
    strategy: input.strategy,
    characterContract: input.characterContract,
    productName: input.productName,
    productVisualPassport: input.productVisualPassport,
    productPhysicalityContract: input.productPhysicalityContract,
    segmentIndex: input.segmentIndex,
    segmentCount: input.segmentCount,
    directorBrief: input.directorBrief,
    referencePolicy,
    wardrobeSource: input.wardrobeSource || "director_reference",
    continuityDirection: input.continuityDirection,
    segmentStartSeconds,
    segmentEndSeconds: input.segmentEndSeconds ?? segmentStartSeconds + duration,
  });
}
