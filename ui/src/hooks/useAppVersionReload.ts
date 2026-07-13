"use client";

import { useEffect } from "react";

const APP_VERSION_POLL_MS = 15_000;
const CURRENT_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "local";

type AppVersionResponse = {
  version?: string;
};

async function fetchAppVersion(): Promise<string | null> {
  const response = await fetch("/api/app-version", { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as AppVersionResponse;
  return typeof data.version === "string" && data.version ? data.version : null;
}

export function useAppVersionReload() {
  useEffect(() => {
    if (CURRENT_APP_VERSION === "local") return;

    let isCancelled = false;

    const checkVersion = async () => {
      try {
        const latestVersion = await fetchAppVersion();
        if (!isCancelled && latestVersion && latestVersion !== CURRENT_APP_VERSION) {
          window.location.reload();
        }
      } catch {
        // Version checks should never interrupt the production flow.
      }
    };

    const intervalId = window.setInterval(checkVersion, APP_VERSION_POLL_MS);
    void checkVersion();

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);
}
