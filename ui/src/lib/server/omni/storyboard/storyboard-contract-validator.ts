import type { OmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-types";
import {
  isProductVisibleInStoryboardFrame,
  mentionsNamedOmniProduct,
  mentionsOmniProduct,
} from "../omni-intro-product-contract";

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
    const transfer = frame.referenceTransfer;

    if (input.contract.productVisibility === "hidden" && productVisible) {
      errors.push(`frame_${frameNumber}_product_visible_when_contract_hidden`);
    }
    if (input.contract.productVisibility === "visible" && !productVisible) {
      errors.push(`frame_${frameNumber}_product_missing_from_physical_demo`);
    }
    if (fixedWardrobe && normalize(frame.wardrobe) !== fixedWardrobe) {
      errors.push(`frame_${frameNumber}_wardrobe_contract_mismatch`);
    }
    if (transfer) {
      if (transfer.productMeaningfulBeat !== productVisible) {
        errors.push(`frame_${frameNumber}_reference_transfer_product_meaning_mismatch`);
      }
      if (transfer.decisions.sourceProduct === "replace_with_product" && !productVisible) {
        errors.push(`frame_${frameNumber}_reference_transfer_product_replacement_missing`);
      }
      if (transfer.decisions.sourceProduct === "remove" && productAction) {
        errors.push(`frame_${frameNumber}_reference_transfer_product_leak`);
      }
      const supportText = `${frame.visualAction} ${frame.productPlacement} ${frame.camera}`;
      for (const prop of transfer.requiredSupportProps || []) {
        if (!mentionsRequiredSupportProp(supportText, prop)) {
          errors.push(`frame_${frameNumber}_reference_support_prop_missing`);
          break;
        }
      }
      if (transfer.cameraComposition && !mentionsRequiredSupportProp(frame.camera, transfer.cameraComposition)) {
        errors.push(`frame_${frameNumber}_reference_composition_missing`);
      }
    }
    if (!productAction) return;
    if (input.contract.productVisibility === "hidden") {
      errors.push(`frame_${frameNumber}_product_action_when_contract_hidden`);
    } else if (!productVisible) {
      errors.push(`frame_${frameNumber}_product_action_without_visible_product`);
    }
  });

  if (input.contract.productVisibility === "visible" &&
      !mentionsOmniProduct(input.storyboard.voiceoverText, input.contract.productName)) {
    errors.push("product_demo_without_product_voiceover");
  }

  return { valid: errors.length === 0, errors };
}

function mentionsRequiredSupportProp(value: string, requirement: string) {
  const actual = tokenSet(value);
  const required = [...tokenSet(requirement)].filter((token) => token.length >= 4);
  return required.length === 0 || required.some((token) => actual.has(token));
}

function tokenSet(value: string) {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []);
}

export function assertStoryboardPromptContracts(
  promptPlan: readonly StoryboardPromptContractInput[],
  productName: string
) {
  const fixedWardrobe = promptPlan.find((segment) => segment.storyboardPlan?.frames[0])
    ?.storyboardPlan?.frames[0]?.wardrobe || "";
  const errors = promptPlan.flatMap((segment) => {
    if (!segment.storyboardPlan) return [`segment_${segment.index}_storyboard_required`];
    const voiceoverMismatch = normalize(segment.storyboardPlan.voiceoverText) !== normalize(segment.voiceoverText);
    const result = validateStoryboardSegmentContract({
      storyboard: segment.storyboardPlan,
      contract: {
        productName,
        productVisibility: segment.creativePlan.productRole === "hidden" ? "hidden" : "visible",
        fixedWardrobe,
      },
    });
    return [
      ...result.errors.map((error) => `segment_${segment.index}_${error}`),
      ...(voiceoverMismatch ? [`segment_${segment.index}_storyboard_voiceover_mismatch`] : []),
    ];
  });
  if (errors.length) throw new Error(`Omni storyboard contract preflight blocked: ${errors.join(", ")}`);
}

function hasProductAction(action: string, productName: string) {
  const text = action.trim();
  return Boolean(text) &&
    !HIDDEN_PRODUCT_PATTERN.test(text) &&
    PRODUCT_ACTION_PATTERN.test(text) &&
    mentionsNamedOmniProduct(text, productName);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[ё]/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
