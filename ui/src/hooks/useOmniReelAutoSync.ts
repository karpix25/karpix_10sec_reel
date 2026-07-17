import { useEffect, useRef } from "react";
import { isActiveOmniSubtitleStatus } from "@/lib/omni/subtitle-status-labels";
import type { OmniReel } from "@/lib/omni/types";

const ACTIVE_REEL_STATUSES = new Set(["queued", "generating", "stitching"]);
const SYNC_INTERVAL_MS = 20_000;
const MIN_REEL_SYNC_GAP_MS = 18_000;

export function useOmniReelAutoSync({
  enabled,
  reels,
  isSyncing,
  onSync,
}: {
  enabled: boolean;
  reels: OmniReel[];
  isSyncing: boolean;
  onSync: (reelId: number) => void;
}) {
  const lastSyncByReelIdRef = useRef<Record<number, number>>({});

  useEffect(() => {
    if (!enabled) return;

    const syncNext = () => {
      if (isSyncing) return;
      const now = Date.now();
      const eligibleReels = reels.filter((reel) => {
        if (reel.final_video_url) {
          if (!isActiveOmniSubtitleStatus(reel.subtitles_status)) return false;
        } else if (!ACTIVE_REEL_STATUSES.has(String(reel.status || "").toLowerCase())) {
          return false;
        }
        const lastSyncAt = lastSyncByReelIdRef.current[reel.id] || 0;
        return now - lastSyncAt >= MIN_REEL_SYNC_GAP_MS;
      });
      const nextReel = eligibleReels.sort((left, right) => {
        const leftSyncedAt = lastSyncByReelIdRef.current[left.id] || 0;
        const rightSyncedAt = lastSyncByReelIdRef.current[right.id] || 0;
        return leftSyncedAt - rightSyncedAt || left.id - right.id;
      })[0];

      if (!nextReel) return;
      lastSyncByReelIdRef.current[nextReel.id] = now;
      onSync(nextReel.id);
    };

    syncNext();
    const intervalId = window.setInterval(syncNext, SYNC_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [enabled, isSyncing, onSync, reels]);
}
