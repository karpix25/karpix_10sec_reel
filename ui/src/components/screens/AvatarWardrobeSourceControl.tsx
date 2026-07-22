"use client";

import { Shirt } from "lucide-react";
import type { OmniProject } from "@/lib/omni/types";
import {
  getOmniWardrobeSourceLabel,
  type OmniWardrobeSource,
} from "@/lib/omni/wardrobe-source";

export function AvatarWardrobeSourceControl({
  project,
  isSaving,
  onChange,
}: {
  project: OmniProject;
  isSaving: boolean;
  onChange: (source: OmniWardrobeSource) => void;
}) {
  return (
    <div className="mt-5 rounded-lg border border-border bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Shirt className="h-4 w-4 text-primary" />
        Одежда персонажа
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-md bg-background p-1">
        {(["director_reference", "avatar_reference"] as const).map((source) => {
          const isActive = project.wardrobe_source === source;
          return (
            <button
              key={source}
              type="button"
              onClick={() => onChange(source)}
              disabled={isSaving || isActive}
              className={`min-h-11 rounded px-3 text-sm font-semibold transition ${
                isActive
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              } disabled:cursor-not-allowed disabled:opacity-60`}
              aria-pressed={isActive}
              title={getOmniWardrobeSourceLabel(source)}
            >
              {getOmniWardrobeSourceLabel(source)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
