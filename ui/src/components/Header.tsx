import { CloudCheck, LoaderCircle } from "lucide-react";

interface HeaderProps {
  screenTitle: string;
  selectedClientName?: string;
  selectedProductName?: string;
  showSettingsSaveStatus?: boolean;
  isSavingSettings?: boolean;
}

export function Header({
  screenTitle,
  selectedClientName,
  selectedProductName,
  showSettingsSaveStatus = false,
  isSavingSettings = false,
}: HeaderProps) {
  return (
    <header className="glass-panel fixed left-0 right-0 top-0 z-40 flex min-h-16 items-center border-b border-border px-4 xl:left-64 xl:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">{screenTitle}</span>
        <div className="h-4 w-px bg-border/70" />
        <button className="max-w-[min(42vw,420px)] truncate border-b-2 border-primary py-1 text-sm font-semibold text-primary">
          {selectedClientName || "Проект"}
        </button>
        {selectedProductName ? (
          <span className="hidden max-w-[18rem] truncate rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground md:inline-flex">
            {selectedProductName}
          </span>
        ) : null}
        {showSettingsSaveStatus ? (
          <div className="ml-3 flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 shadow-sm backdrop-blur-sm">
            {isSavingSettings ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Сохранение...</span>
              </>
            ) : (
              <>
                <CloudCheck className="h-4 w-4 text-emerald-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Сохранено</span>
              </>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
