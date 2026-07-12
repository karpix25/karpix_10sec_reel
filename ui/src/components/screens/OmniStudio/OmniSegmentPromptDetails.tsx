"use client";

import type { ReactNode } from "react";
import { Mic2, Smartphone, Video } from "lucide-react";
import { extractOmniPromptSections } from "@/lib/omni/prompt-sections";

export function OmniSegmentPromptDetails({
  prompt,
  voiceoverText,
}: {
  prompt: string | null | undefined;
  voiceoverText?: string | null;
}) {
  const sections = extractOmniPromptSections(prompt);
  const voiceover = voiceoverText || sections.voiceover;

  return (
    <div className="mt-2 grid gap-2 text-xs">
      {voiceover ? (
        <PromptSection
          icon={<Mic2 className="h-3.5 w-3.5" />}
          label="Озвучка этой части"
          value={voiceover}
          strong
        />
      ) : null}
      {sections.scriptBeat ? (
        <PromptSection icon={<Video className="h-3.5 w-3.5" />} label="Сцена" value={sections.scriptBeat} />
      ) : null}
      {sections.ugcStyle ? (
        <PromptSection icon={<Smartphone className="h-3.5 w-3.5" />} label="UGC mobile style" value={sections.ugcStyle} />
      ) : null}
    </div>
  );
}

function PromptSection({
  icon,
  label,
  value,
  strong,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-primary">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`whitespace-pre-wrap break-words leading-5 ${strong ? "text-foreground" : "text-muted-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
