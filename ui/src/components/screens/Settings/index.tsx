import React from "react";
import { HeygenAvatarConfig, Settings, Voice } from "@/types";
import { AudioLibraryScreen } from "@/components/screens/AudioLibrary";
import { useSettingsState } from "./useSettingsState";
import { AutomationSettings } from "./components/AutomationSettings";

interface SettingsScreenProps {
  settings: Settings;
  avatarConfigs: HeygenAvatarConfig[];
  selectedClientId: string | null;
  minimaxVoices: Voice[];
  elevenlabsVoices: Voice[];
  heygenCatalog: HeygenAvatarConfig[];
  onSave: (settings: Settings) => void;
  onSaveHeygenAvatars: (avatars: HeygenAvatarConfig[]) => void;
  onDeleteProject: () => void;
  canDeleteProject: boolean;
  onRefreshHeygenCatalog?: () => Promise<HeygenAvatarConfig[]>;
  onRefreshWorkspace?: () => void;
  isSaving: boolean;
  isSavingHeygenAvatars: boolean;
  isDeletingProject: boolean;
}

const SettingsScreen: React.FC<SettingsScreenProps> = (props) => {
  const state = useSettingsState(props);

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-slate-50/50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Настройки
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Автоматика и аудио
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Здесь управляются автоматический режим, лимиты production-пайплайна и глобальная библиотека музыки для финальных роликов.
          </p>
        </header>

        <AutomationSettings
          draftSettings={state.draftSettings}
          setDraftSettings={state.setDraftSettings}
          isManualFinalRunPending={state.isManualFinalRunPending}
          onManualFinalRun={state.handleManualFinalAutomationRun}
        />

        <AudioLibraryScreen />
      </div>
    </div>
  );
};

export default SettingsScreen;
