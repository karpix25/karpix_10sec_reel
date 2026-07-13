"use client";

import { Cloud, Cpu } from "lucide-react";
import {
  getOmniGenerationProviderLabel,
  type OmniGenerationProvider,
} from "@/lib/omni/provider";

type OmniProviderSwitchProps = {
  provider: OmniGenerationProvider;
  onProviderChange: (provider: OmniGenerationProvider) => void;
};

const OPTIONS: Array<{ provider: OmniGenerationProvider; icon: typeof Cpu }> = [
  { provider: "cometapi", icon: Cpu },
  { provider: "kie-ai", icon: Cloud },
];

export function OmniProviderSwitch({ provider, onProviderChange }: OmniProviderSwitchProps) {
  return (
    <section className="rounded-lg border border-border bg-background/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Omni Provider
        </p>
        <span className="text-xs font-semibold text-foreground">
          {getOmniGenerationProviderLabel(provider)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = provider === option.provider;
          return (
            <button
              key={option.provider}
              type="button"
              onClick={() => onProviderChange(option.provider)}
              className={`inline-flex min-h-9 items-center justify-center gap-2 rounded px-2 text-xs font-semibold transition ${
                isActive
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              }`}
              aria-pressed={isActive}
              title={`Использовать ${getOmniGenerationProviderLabel(option.provider)}`}
            >
              <Icon className="h-4 w-4" />
              <span>{getOmniGenerationProviderLabel(option.provider)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
