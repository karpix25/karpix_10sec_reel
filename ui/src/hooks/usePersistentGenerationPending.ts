import { useEffect, useState } from "react";
import type { OmniGeneratedScript, OmniReel } from "@/lib/omni/types";
import type { PendingScriptDraft, PendingVideoDraft } from "@/components/screens/GenerationPendingCards";

const SCRIPT_TTL_MS = 30 * 60 * 1000;
const VIDEO_TTL_MS = 2 * 60 * 60 * 1000;

function readStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null") as T | null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, value: T | null) {
  if (typeof window === "undefined") return;
  if (!value) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

function isFresh(startedAt: number, ttlMs: number) {
  return Date.now() - startedAt < ttlMs;
}

export function usePersistentGenerationPending(input: {
  projectId: number | null;
  productId: number | null;
  generatedScripts: OmniGeneratedScript[];
  reels: OmniReel[];
  videoError: boolean;
}) {
  const storageKey = input.projectId && input.productId ? `omni-generation-pending:${input.projectId}:${input.productId}` : null;
  const [pendingDrafts, setPendingDraftsState] = useState<PendingScriptDraft[]>([]);
  const [pendingVideo, setPendingVideoState] = useState<PendingVideoDraft | null>(null);

  useEffect(() => {
    if (!storageKey) {
      setPendingDraftsState([]);
      setPendingVideoState(null);
      return;
    }
    const saved = readStorage<{
      draft?: PendingScriptDraft | null;
      drafts?: PendingScriptDraft[];
      video?: PendingVideoDraft | null;
    }>(storageKey);
    const savedDrafts = Array.isArray(saved?.drafts) ? saved.drafts : saved?.draft ? [saved.draft] : [];
    setPendingDraftsState(savedDrafts.filter((draft) => isFresh(draft.startedAt, SCRIPT_TTL_MS)));
    setPendingVideoState(saved?.video && isFresh(saved.video.startedAt, VIDEO_TTL_MS) ? saved.video : null);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    writeStorage(storageKey, { drafts: pendingDrafts, video: pendingVideo });
  }, [pendingDrafts, pendingVideo, storageKey]);

  useEffect(() => {
    if (!pendingDrafts.length) return;
    setPendingDraftsState((current) => reconcilePendingDrafts(current, input.generatedScripts));
  }, [input.generatedScripts, pendingDrafts.length]);

  useEffect(() => {
    if (!pendingVideo) return;
    const hasReel = input.reels.some((reel) => reel.source_generated_script_id === pendingVideo.scriptId);
    if (input.videoError || hasReel || !isFresh(pendingVideo.startedAt, VIDEO_TTL_MS)) {
      setPendingVideoState(null);
    }
  }, [input.reels, input.videoError, pendingVideo]);

  return {
    pendingDrafts,
    pendingVideo,
    addPendingDraft: (draft: PendingScriptDraft) =>
      setPendingDraftsState((current) => [...current, draft].filter((item) => isFresh(item.startedAt, SCRIPT_TTL_MS))),
    removePendingDraft: (draftId: string) =>
      setPendingDraftsState((current) => current.filter((draft) => draft.id !== draftId)),
    setPendingVideo: setPendingVideoState,
  };
}

function reconcilePendingDrafts(
  pendingDrafts: PendingScriptDraft[],
  generatedScripts: OmniGeneratedScript[]
) {
  const freshDrafts = pendingDrafts
    .filter((draft) => isFresh(draft.startedAt, SCRIPT_TTL_MS))
    .sort((a, b) => a.startedAt - b.startedAt);
  if (!freshDrafts.length) return [];

  let consumedScriptIds = new Set<number>();
  return freshDrafts.filter((draft) => {
    const matchingScript = generatedScripts.find((script) => {
      if (consumedScriptIds.has(script.id)) return false;
      return new Date(script.created_at).getTime() >= draft.startedAt - 2000;
    });
    if (!matchingScript) return true;
    consumedScriptIds = new Set(consumedScriptIds).add(matchingScript.id);
    return false;
  });
}
