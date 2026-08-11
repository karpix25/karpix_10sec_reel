import type { OmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-types";
import {
  isProductVisibleInStoryboardFrame,
  mentionsOmniProduct,
} from "../omni-intro-product-contract";
import { deriveOmniSegmentIntents } from "../omni-segment-intent";

export type StoryboardSegmentContract = {
  productName: string;
  productVisibility: "hidden" | "visible";
  fixedWardrobe: string;
};

export type StoryboardContractValidationResult = {
  valid: boolean;
  errors: string[];
};

type StoryboardPromptContractInput = {
  index: number;
  voiceoverText: string;
  storyboardPlan: OmniStoryboardSegment | null;
  creativePlan: { productRole: string };
};

const PRODUCT_ACTION_PATTERN =
  /(?:держит|бер[её]т|показывает|демонстрирует|наносит|использует|открывает|ставит|клад[её]т|holding|holds|shows|demonstrates|applies|uses|opens|places)/iu;
const GENERIC_PRODUCT_PATTERN = /(?:продукт|товар|упаков|баноч|флакон|тюбик|product|package|jar|bottle|tube)/iu;
const HIDDEN_PRODUCT_PATTERN = /(?:вне\s+кадра|не\s+виден|скрыт|без\s+(?:продукта|товара|упаковки)|hidden|off\s*camera)/iu;

/** Validates the text plan before a storyboard image or video generation is paid for. */
export function validateStoryboardSegmentContract(input: {
  storyboard: OmniStoryboardSegment;
  contract: StoryboardSegmentContract;
}): StoryboardContractValidationResult {
  const errors: string[] = [];
  const fixedWardrobe = normalize(input.contract.fixedWardrobe);

  if (!fixedWardrobe) errors.push("fixed_wardrobe_required");

  input.storyboard.frames.forEach((frame, index) => {
    const frameNumber = index + 1;
    const productVisible = isProductVisibleInStoryboardFrame(frame, input.contract.productName);
    const productAction = hasProductAction(frame.visualAction, input.contract.productName);

    if (input.contract.productVisibility === "hidden" && productVisible) {
      errors.push(`frame_${frameNumber}_product_visible_when_contract_hidden`);
    }
    if (fixedWardrobe && normalize(frame.wardrobe) !== fixedWardrobe) {
      errors.push(`frame_${frameNumber}_wardrobe_contract_mismatch`);
    }
    if (!productAction) return;
    if (input.contract.productVisibility === "hidden") {
      errors.push(`frame_${frameNumber}_product_action_when_contract_hidden`);
    } else if (!productVisible) {
      errors.push(`frame_${frameNumber}_product_action_without_visible_product`);
    } else if (!mentionsOmniProduct(frame.spokenText, input.contract.productName)) {
      errors.push(`frame_${frameNumber}_product_action_without_product_voiceover`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function assertStoryboardPromptContracts(
  promptPlan: readonly StoryboardPromptContractInput[],
  productName: string
) {
  const intents = deriveOmniSegmentIntents(
    promptPlan.map((segment) => ({ index: segment.index, spokenText: segment.voiceoverText })),
    productName
  );
  const fixedWardrobe = promptPlan.find((segment) => segment.storyboardPlan?.frames[0])
    ?.storyboardPlan?.frames[0]?.wardrobe || "";
  const errors = promptPlan.flatMap((segment, offset) => {
    const intent = intents[offset];
    if (!segment.storyboardPlan) return [`segment_${segment.index}_storyboard_required`];
    const voiceoverMismatch = normalize(segment.storyboardPlan.voiceoverText) !== normalize(intent?.spokenText || "");
    const result = validateStoryboardSegmentContract({
      storyboard: segment.storyboardPlan,
      contract: {
        productName,
        productVisibility: intent?.productVisible ? "visible" : "hidden",
        fixedWardrobe,
      },
    });
    const roleMismatch = (segment.creativePlan.productRole !== "hidden") !== Boolean(intent?.productVisible);
    return [
      ...result.errors.map((error) => `segment_${segment.index}_${error}`),
      ...(voiceoverMismatch ? [`segment_${segment.index}_storyboard_voiceover_mismatch`] : []),
      ...(roleMismatch ? [`segment_${segment.index}_product_role_voiceover_mismatch`] : []),
    ];
  });
  if (errors.length) throw new Error(`Omni storyboard contract preflight blocked: ${errors.join(", ")}`);
}

function hasProductAction(action: string, productName: string) {
  const text = action.trim();
  return Boolean(text) &&
    !HIDDEN_PRODUCT_PATTERN.test(text) &&
    PRODUCT_ACTION_PATTERN.test(text) &&
    (mentionsOmniProduct(text, productName) || GENERIC_PRODUCT_PATTERN.test(text));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[ё]/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
