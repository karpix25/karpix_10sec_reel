import type { DirectorBrief } from "./director-analysis-types";
import {
  isCollagePictureInPictureReference,
  referenceUsesProductOrScienceBackground,
} from "./director-layout-contract";

export type ReferenceTransferMode = "full_reference" | "style_only";

export type ReferenceTransferPolicy = {
  mode: ReferenceTransferMode;
  omitRawDirectorGuidance: boolean;
};

type DomainId =
  | "beauty_supplement"
  | "meal_prep"
  | "fitness"
  | "office"
  | "fashion"
  | "cleaning"
  | "car";

type DomainRule = {
  id: DomainId;
  pattern: RegExp;
};

const DOMAIN_RULES: readonly DomainRule[] = [
  {
    id: "beauty_supplement",
    pattern: /коллаген|бад|добавк|витамин|кож|волос|ногт|сустав|beauty|collagen|supplement|vitamin|skin|hair|joint/iu,
  },
  {
    id: "meal_prep",
    pattern: /рацион|калори|еда|питани|кухн|контейнер|весы|мяс|куриц|салат|доставк|meal|food|kitchen|container|scale|meat|chicken|greens|delivery|portion/iu,
  },
  {
    id: "fitness",
    pattern: /трениров|спорт|зал|мышц|бег|гантел|fitness|gym|workout|muscle|running|dumbbell/iu,
  },
  {
    id: "office",
    pattern: /офис|работ|ноутбук|документ|стол|созвон|office|laptop|desk|document|meeting|work call/iu,
  },
  {
    id: "fashion",
    pattern: /одежд|сумк|обув|аксессуар|гардероб|fashion|outfit|bag|shoe|wardrobe|accessory/iu,
  },
  {
    id: "cleaning",
    pattern: /уборк|пятн|пыль|ванн|раковин|cleaning|stain|dust|bathroom|sink/iu,
  },
  {
    id: "car",
    pattern: /машин|авто|руль|парков|дорог|car|auto|driving|parking|road/iu,
  },
];

const STRONG_FOREIGN_PROCESS =
  /gloved hands|staff|workers|assembly|packing|scale|container|commercial|prep table|digital scale|перчат|работник|сборк|упаков|весы|контейнер|цех|производств/iu;

export function buildReferenceTransferPolicy(input: {
  directorBrief: DirectorBrief | null;
  productName: string;
  productDescription?: string | null;
  productReferenceNotes?: string | null;
  hasProductReference: boolean;
}): ReferenceTransferPolicy {
  if (!input.directorBrief || !input.hasProductReference) {
    return { mode: "full_reference", omitRawDirectorGuidance: false };
  }

  const productDomains = detectDomains([
    input.productName,
    input.productDescription,
    input.productReferenceNotes,
  ].filter(Boolean).join(" "));
  const referenceText = getDirectorReferenceText(input.directorBrief);
  const referenceDomains = detectDomains(referenceText);
  const hasDomainOverlap = [...referenceDomains].some((domain) => productDomains.has(domain));
  const hasForeignProcess = STRONG_FOREIGN_PROCESS.test(referenceText);
  const isProductCollageReference =
    isCollagePictureInPictureReference(input.directorBrief) &&
    referenceUsesProductOrScienceBackground(input.directorBrief);

  if (isProductCollageReference && hasDomainOverlap) {
    return { mode: "full_reference", omitRawDirectorGuidance: false };
  }

  if (productDomains.size && referenceDomains.size && !hasDomainOverlap) {
    return { mode: "style_only", omitRawDirectorGuidance: true };
  }
  if (hasForeignProcess && productDomains.has("beauty_supplement") && referenceDomains.has("meal_prep")) {
    return { mode: "style_only", omitRawDirectorGuidance: true };
  }

  return { mode: "full_reference", omitRawDirectorGuidance: false };
}

function detectDomains(text: string) {
  const normalized = text.toLowerCase().replace(/ё/g, "е");
  return new Set(DOMAIN_RULES.filter((rule) => rule.pattern.test(normalized)).map((rule) => rule.id));
}

function getDirectorReferenceText(brief: DirectorBrief) {
  return [
    brief.visual_hook.action,
    brief.visual_hook.retention_trigger,
    brief.atmosphere.mood,
    brief.atmosphere.setting,
    ...brief.action_beats.flatMap((beat) => [beat.action_description, beat.actor_gesture]),
    ...brief.reusable_mechanics.visual_mechanics,
    brief.reusable_mechanics.looping_pattern,
  ].filter(Boolean).join(" ");
}
