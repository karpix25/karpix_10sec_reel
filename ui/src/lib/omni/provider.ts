export const OMNI_GENERATION_PROVIDERS = ["cometapi", "kie-ai"] as const;

export type OmniGenerationProvider = (typeof OMNI_GENERATION_PROVIDERS)[number];

export const DEFAULT_OMNI_GENERATION_PROVIDER: OmniGenerationProvider = "cometapi";

export function normalizeOmniGenerationProvider(value: unknown): OmniGenerationProvider {
  return value === "kie-ai" ? "kie-ai" : DEFAULT_OMNI_GENERATION_PROVIDER;
}

export function getOmniGenerationProviderLabel(provider: OmniGenerationProvider) {
  return provider === "kie-ai" ? "KIE.ai" : "CometAPI";
}
