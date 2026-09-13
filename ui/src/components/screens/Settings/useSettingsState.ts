import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Settings } from "@/types";
import { getOmniGenerationProviderLabel, type OmniGenerationProvider } from "@/lib/omni/provider";

type AutomationSettings = {
  auto_generate_reels: boolean;
  automation_provider: OmniGenerationProvider;
  daily_reel_limit: number;
  project_reel_limit: number;
  daily_job_count: number;
  project_job_count: number;
  open_jobs: number;
  automation_stopped_at: string | null;
  automation_stop_reason: string | null;
};

export type SettingsScreenProps = {
  settings: Settings;
  selectedClientId: string | null;
  projectId: number | null;
  productId: number | null;
  provider: OmniGenerationProvider;
  onSave: (settings: Settings) => Promise<void>;
};

async function requestJson(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.error || "Не удалось сохранить настройки");
  return payload;
}

export function useSettingsState(props: SettingsScreenProps) {
  const { projectId, productId, provider, selectedClientId, settings } = props;
  const queryClient = useQueryClient();
  const queryKey = ["omni-automation-settings", projectId];
  const [legacyPatch, setLegacyPatch] = useState<Partial<Settings>>({});
  const latest = useRef(props);
  const unsaved = useRef<Partial<Settings> | null>(null);
  useEffect(() => { latest.current = props; }, [props]);

  const automation = useQuery<AutomationSettings>({
    queryKey,
    queryFn: () => requestJson(`/api/omni/automation/settings?projectId=${projectId}`),
    enabled: Boolean(projectId),
    refetchInterval: 30_000,
  });
  const saveAutomation = useMutation({
    mutationFn: (next: Settings) => requestJson("/api/omni/automation/settings", {
      projectId,
      provider,
      autoGenerateReels: next.auto_generate_final_videos,
      dailyReelLimit: next.daily_final_video_limit,
      projectReelLimit: next.monthly_final_video_limit,
    }, "PUT"),
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
    onError: (error) => toast.error(error.message),
  });
  const manualRun = useMutation({
    mutationFn: () => requestJson("/api/automation/final-videos/manual-run", { projectId, productId, provider }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success(data.queuedCount > 0
        ? `В очередь добавлено роликов: ${data.queuedCount}`
        : "Новые задачи не добавлены: проверьте лимиты и текущую очередь");
    },
    onError: (error) => toast.error(error.message),
  });

  // Only the visible legacy fields are saved; automation belongs to omni_projects.
  useEffect(() => {
    if (!Object.keys(legacyPatch).length || !selectedClientId) return;
    unsaved.current = legacyPatch;
    const timer = setTimeout(() => {
      void latest.current.onSave({ ...latest.current.settings, ...legacyPatch })
        .then(() => { if (unsaved.current === legacyPatch) unsaved.current = null; })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки"));
    }, 1000);
    return () => clearTimeout(timer);
  }, [legacyPatch, selectedClientId]);
  useEffect(() => () => {
    if (unsaved.current && latest.current.selectedClientId) {
      void latest.current.onSave({ ...latest.current.settings, ...unsaved.current })
        .catch((error) => toast.error(error instanceof Error ? error.message : "Не удалось сохранить настройки"));
    }
  }, []);

  const data = automation.data;
  const draftSettings: Settings = {
    ...settings,
    ...legacyPatch,
    auto_generate_final_videos: data?.auto_generate_reels ?? false,
    daily_final_video_limit: data?.daily_reel_limit ?? 3,
    monthly_final_video_limit: data?.project_reel_limit ?? 30,
    daily_final_video_count: data?.daily_job_count ?? 0,
    monthly_final_video_count: data?.project_job_count ?? 0,
    open_final_video_jobs: data?.open_jobs ?? 0,
    final_video_automation_stopped_at: data?.automation_stopped_at ?? null,
    final_video_automation_stop_reason: data?.automation_stop_reason ?? null,
  };
  const setDraftSettings: Dispatch<SetStateAction<Settings>> = (update) => {
    const next = typeof update === "function" ? update(draftSettings) : update;
    if (next.auto_generate_final_videos !== draftSettings.auto_generate_final_videos
      || next.daily_final_video_limit !== draftSettings.daily_final_video_limit
      || next.monthly_final_video_limit !== draftSettings.monthly_final_video_limit) {
      if (data) saveAutomation.mutate(next);
      return;
    }
    if (!selectedClientId) {
      toast.error("Для изменения длительности и папки свяжите бренд с клиентом");
      return;
    }
    setLegacyPatch({
      target_duration_seconds: next.target_duration_seconds,
      target_duration_min_seconds: next.target_duration_min_seconds,
      target_duration_max_seconds: next.target_duration_max_seconds,
      yandex_disk_folder_path: next.yandex_disk_folder_path,
    });
  };

  return {
    draftSettings,
    setDraftSettings,
    isReady: Boolean(projectId && data),
    savedProviderLabel: data ? getOmniGenerationProviderLabel(data.automation_provider) : null,
    manualProviderLabel: getOmniGenerationProviderLabel(provider),
    isSaving: saveAutomation.isPending,
    error: !projectId ? "Выберите бренд для настройки автоматики" : automation.error?.message,
    isManualFinalRunPending: manualRun.isPending,
    handleManualFinalAutomationRun: () => manualRun.mutate(),
  };
}
