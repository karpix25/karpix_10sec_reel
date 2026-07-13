"use client";

import { useState } from "react";
import {
  DEFAULT_OMNI_GENERATION_PROVIDER,
  normalizeOmniGenerationProvider,
  type OmniGenerationProvider,
} from "@/lib/omni/provider";

const STORAGE_KEY = "omni-generation-provider-v1";

export function useOmniProviderPreference() {
  const [provider, setProviderState] = useState<OmniGenerationProvider>(() => {
    if (typeof window === "undefined") return DEFAULT_OMNI_GENERATION_PROVIDER;
    try {
      return normalizeOmniGenerationProvider(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      return DEFAULT_OMNI_GENERATION_PROVIDER;
    }
  });

  const setProvider = (nextProvider: OmniGenerationProvider) => {
    setProviderState(nextProvider);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextProvider);
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  };

  return [provider, setProvider] as const;
}
