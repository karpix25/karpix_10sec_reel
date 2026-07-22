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
