import React from "react";
import { useSettingsState, type SettingsScreenProps } from "./useSettingsState";
import { AutomationSettings } from "./components/AutomationSettings";

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
            Автоматика
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Здесь управляются автоматический режим, лимиты production-пайплайна и проектная длина сценария.
          </p>
          {state.savedProviderLabel ? <p className="mt-2 text-sm text-muted-foreground">
            Автоматический режим: {state.savedProviderLabel}. Ручной запуск: {state.manualProviderLabel}.
            При изменении настроек для автоматики сохраняется выбранный провайдер.
          </p> : null}
        </header>

        {state.error ? <p role="alert" className="text-sm text-red-600">{state.error}</p> : null}
        <fieldset disabled={!state.isReady || state.isSaving} className="disabled:opacity-60">
          <AutomationSettings
            legacySettingsAvailable={Boolean(props.selectedClientId)}
            draftSettings={state.draftSettings}
            setDraftSettings={state.setDraftSettings}
            isManualFinalRunPending={state.isManualFinalRunPending}
            onManualFinalRun={state.handleManualFinalAutomationRun}
          />
        </fieldset>
      </div>
    </div>
  );
};

export default SettingsScreen;
