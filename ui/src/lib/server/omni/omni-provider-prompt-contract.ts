import { OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT } from "./omni-scene-safety-contract";
import { renderOmniNaturalismContract } from "./omni-naturalism-contract";

export const OMNI_PROVIDER_PROMPT_STYLES = ["structured", "simple_full_body"] as const;

export type OmniProviderPromptStyle = (typeof OMNI_PROVIDER_PROMPT_STYLES)[number];

export const OMNI_CLEAN_FRAME_PROMPT =
  [
    "Кадр выглядит как сырая бытовая видеозапись напрямую с сенсора камеры: полный экран, реальная сцена, человек, локация, предметы и естественный свет.",
    renderOmniNaturalismContract(),
    "В кадре полностью отсутствуют любые элементы интерфейса, водяные знаки, наложенный текст, субтитры, кнопки или логотипы.",
    "Графическая рамка разрешена только если reference layout явно требует бумажную обводку cutout-аватара.",
    OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT,
  ].join(" ");

export const OMNI_PROVIDER_CONTINUOUS_SYSTEM_PROMPT = [
  "Сделай живую видеозапись человека в реальном окружении, вертикальный формат 9:16, одним непрерывным кадром.",
  OMNI_CLEAN_FRAME_PROMPT,
  "Описывай только физически выполнимые действия и точную речь.",
].join(" ");

export const OMNI_PROVIDER_PROMPT_CONTRACT_VERSION = "omni-provider-prompt-v2";

type PromptReference = {
  role: string;
};

export function renderOmniProviderPromptContract(input: {
  basePrompt: string;
  voiceoverText: string;
  references: readonly PromptReference[];
  characterIdentityLocked: boolean;
  storyboardDriven?: boolean;
}) {
  const referenceRoles = input.references.length
    ? input.references.map((reference, index) => `image ${index + 1}=${reference.role}`).join("; ")
    : "no image references";
  const identityAuthority = input.characterIdentityLocked
    ? "The supplied character_ids value is the sole identity authority for the featured presenter. Images control only their declared visual roles and must not replace the presenter."
    : "Use only the identity source declared in the content plan; do not invent an additional presenter.";

  const contentPlan = input.storyboardDriven
    ? renderStoryboardDrivenContentPlan({
        voiceoverText: input.voiceoverText,
        references: input.references,
        characterIdentityLocked: input.characterIdentityLocked,
      })
    : input.basePrompt.trim();

  const prompt = [
    `PROMPT CONTRACT: ${OMNI_PROVIDER_PROMPT_CONTRACT_VERSION}`,
    `REFERENCE ROLES: ${referenceRoles}. Do not transfer facts between reference roles.`,
    `IDENTITY: ${identityAuthority}`,
    "CONTENT PLAN:",
    contentPlan,
    "SPEECH CONTRACT: Speak the one exact quoted voiceover from CONTENT PLAN exactly once. Do not speak instructions, labels, or reference descriptions.",
    "ENDING: End naturally after the planned final visual beat. Do not add a logo card, interface, subtitle, caption, watermark, outro, or extra speech.",
  ].join("\n\n");

  assertOmniProviderPromptContract({
    prompt,
    voiceoverText: input.voiceoverText,
    expectedReferenceCount: input.references.length,
  });
  return prompt;
}

function renderStoryboardDrivenContentPlan(input: {
  voiceoverText: string;
  references: readonly PromptReference[];
  characterIdentityLocked: boolean;
}) {
  const storyboardIndex = input.references.findIndex((reference) => reference.role === "storyboard");
  if (storyboardIndex < 0) throw new Error("Storyboard-driven Omni prompt requires a storyboard reference");
  const productFiles = input.references
    .map((reference, index) => reference.role === "product" || reference.role === "product_secondary" ? `@file${index + 1}` : null)
    .filter((value): value is string => Boolean(value));
  const storyboardFile = `@file${storyboardIndex + 1}`;
  return [
    `${storyboardFile} is the mandatory visual and directing instruction. Follow its panels strictly from left to right, two seconds per panel.`,
    "Reproduce the storyboard's framing, location, wardrobe, lighting, camera, action, cuts, and product visibility without inventing replacements or contradicting details.",
    input.characterIdentityLocked
      ? "Use character_ids as the sole authority for the presenter's face, body, hair, age, and identity. The storyboard controls the presenter's wardrobe, pose, and scene."
      : "Do not invent a new presenter or identity beyond the storyboard's declared visual plan.",
    productFiles.length
      ? `${productFiles.join(" and ")} are the sole authority for product appearance. Show the product only in storyboard panels that contain it.`
      : "Do not invent a product that is absent from the supplied references.",
    "The REPLICA instruction strip under each storyboard panel is audio direction only. Speak those Russian words in panel order; never render the strip, panel borders, labels, timestamps, subtitles, or other text in the final video.",
    `Exact Russian voiceover safety copy: "${input.voiceoverText.trim()}"`,
    "Create a clean full-screen vertical video, not a contact sheet. Start speaking immediately and keep natural continuous pacing across cuts.",
  ].filter(Boolean).join("\n");
}

export function assertOmniProviderPromptContract(input: {
  prompt: string;
  voiceoverText: string;
  expectedReferenceCount?: number;
}) {
  const requiredSections = [
    "PROMPT CONTRACT:",
    "REFERENCE ROLES:",
    "IDENTITY:",
    "CONTENT PLAN:",
    "SPEECH CONTRACT:",
    "ENDING:",
  ];
  const missing = requiredSections.filter((section) => !input.prompt.includes(section));
  if (missing.length) {
    throw new Error(`Omni provider prompt is missing required sections: ${missing.join(", ")}`);
  }

  const voiceover = input.voiceoverText.trim();
  if (!voiceover) throw new Error("Omni provider prompt requires a non-empty voiceover");
  const occurrences = countLiteralOccurrences(input.prompt, voiceover);
  if (occurrences !== 1) {
    throw new Error(`Omni provider prompt must contain the exact voiceover once; found ${occurrences}`);
  }

  if (typeof input.expectedReferenceCount === "number") {
    for (let index = 1; index <= input.expectedReferenceCount; index += 1) {
      if (!input.prompt.includes(`image ${index}=`)) {
        throw new Error(`Omni provider prompt is missing reference role for image ${index}`);
      }
    }
  }
}

function countLiteralOccurrences(value: string, needle: string) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = value.indexOf(needle, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + needle.length;
  }
}

export function getOmniProviderPromptStyle(): OmniProviderPromptStyle {
  return getPromptStyleEnv() === "simple_full_body"
    ? "simple_full_body"
    : "structured";
}

export function isSimpleFullBodyProviderPromptStyle() {
  return getOmniProviderPromptStyle() === "simple_full_body";
}

function getPromptStyleEnv() {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.OMNI_PROVIDER_PROMPT_STYLE;
}
