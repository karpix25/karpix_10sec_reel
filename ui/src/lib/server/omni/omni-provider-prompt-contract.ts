export const OMNI_PROVIDER_PROMPT_STYLES = ["structured", "simple_full_body"] as const;

export type OmniProviderPromptStyle = (typeof OMNI_PROVIDER_PROMPT_STYLES)[number];

export const OMNI_CLEAN_FRAME_PROMPT =
  "Кадр выглядит как обычное сырое видео с камеры: полный экран, реальная сцена, человек, локация, предметы и естественный свет.";

export const OMNI_PROVIDER_CONTINUOUS_SYSTEM_PROMPT = [
  "Сделай живое короткое вертикальное видео 9:16 одним непрерывным телефонным кадром.",
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
