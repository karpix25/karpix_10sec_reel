import { useEffect, useRef } from "react";
import type { OmniReel } from "@/lib/omni/types";

const ACTIVE_REEL_STATUSES = new Set(["queued", "generating", "stitching"]);
const SYNC_INTERVAL_MS = 20_000;
const MIN_REEL_SYNC_GAP_MS = 18_000;

export function useOmniReelAutoSync(input: {
  enabled: boolean;
  reels: OmniReel[];
  isSyncing: boolean;
  onSync: (reelId: number) => void;
}) {
  const lastSyncByReelIdRef = useRef<Record<number, number>>({});

  useEffect(() => {
    if (!input.enabled) return;

    const syncNext = () => {
      if (input.isSyncing) return;
      const now = Date.now();
      const nextReel = input.reels.find((reel) => {
        if (reel.final_video_url) return false;
        if (!ACTIVE_REEL_STATUSES.has(String(reel.status || "").toLowerCase())) return false;
        const lastSyncAt = lastSyncByReelIdRef.current[reel.id] || 0;
        return now - lastSyncAt >= MIN_REEL_SYNC_GAP_MS;
      });

      if (!nextReel) return;
      lastSyncByReelIdRef.current[nextReel.id] = now;
      input.onSync(nextReel.id);
    };

    syncNext();
    const intervalId = window.setInterval(syncNext, SYNC_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [input.enabled, input.isSyncing, input.onSync, input.reels]);
}
