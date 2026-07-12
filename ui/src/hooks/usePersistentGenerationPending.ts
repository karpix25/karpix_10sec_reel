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
  scriptError: boolean;
  videoError: boolean;
}) {
  const storageKey = input.projectId && input.productId ? `omni-generation-pending:${input.projectId}:${input.productId}` : null;
  const [pendingDraft, setPendingDraftState] = useState<PendingScriptDraft | null>(null);
  const [pendingVideo, setPendingVideoState] = useState<PendingVideoDraft | null>(null);

  useEffect(() => {
    if (!storageKey) {
      setPendingDraftState(null);
      setPendingVideoState(null);
      return;
    }
    const saved = readStorage<{ draft?: PendingScriptDraft | null; video?: PendingVideoDraft | null }>(storageKey);
    setPendingDraftState(saved?.draft && isFresh(saved.draft.startedAt, SCRIPT_TTL_MS) ? saved.draft : null);
    setPendingVideoState(saved?.video && isFresh(saved.video.startedAt, VIDEO_TTL_MS) ? saved.video : null);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    writeStorage(storageKey, { draft: pendingDraft, video: pendingVideo });
  }, [pendingDraft, pendingVideo, storageKey]);

  useEffect(() => {
    if (!pendingDraft) return;
    const hasFreshScript = input.generatedScripts.some(
      (script) => new Date(script.created_at).getTime() >= pendingDraft.startedAt - 2000
    );
    if (input.scriptError || hasFreshScript || !isFresh(pendingDraft.startedAt, SCRIPT_TTL_MS)) {
      setPendingDraftState(null);
    }
  }, [input.generatedScripts, input.scriptError, pendingDraft]);

  useEffect(() => {
    if (!pendingVideo) return;
    const hasReel = input.reels.some((reel) => reel.source_generated_script_id === pendingVideo.scriptId);
    if (input.videoError || hasReel || !isFresh(pendingVideo.startedAt, VIDEO_TTL_MS)) {
      setPendingVideoState(null);
    }
  }, [input.reels, input.videoError, pendingVideo]);

  return {
    pendingDraft,
    pendingVideo,
    setPendingDraft: setPendingDraftState,
    setPendingVideo: setPendingVideoState,
  };
}
