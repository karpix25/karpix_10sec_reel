"use client";

import type { ReactNode } from "react";
import { Mic2, Smartphone, Video } from "lucide-react";
import { extractOmniPromptSections } from "@/lib/omni/prompt-sections";
import type {
  OmniCreativeStrategy,
  OmniPromptValidationResult,
  OmniSegmentCreativePlan,
} from "@/lib/omni/creative-contract";

export function OmniSegmentPromptDetails({
  prompt,
  voiceoverText,
  creativeStrategy,
  creativePlan,
  validation,
}: {
  prompt: string | null | undefined;
  voiceoverText?: string | null;
  creativeStrategy?: OmniCreativeStrategy | null;
  creativePlan?: OmniSegmentCreativePlan | null;
  validation?: OmniPromptValidationResult | null;
}) {
  const sections = extractOmniPromptSections(prompt);
  const voiceover = voiceoverText || sections.voiceover;

  return (
    <div className="mt-2 grid gap-2 text-xs">
      {creativePlan ? (
        <CreativePlanSummary strategy={creativeStrategy} plan={creativePlan} validation={validation} />
      ) : null}
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

function CreativePlanSummary({
  strategy,
  plan,
  validation,
}: {
  strategy?: OmniCreativeStrategy | null;
  plan: OmniSegmentCreativePlan;
  validation?: OmniPromptValidationResult | null;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded bg-primary/10 px-2 py-1 font-semibold text-primary">{strategy?.lifeFormatId || plan.lifeFormatId}</span>
        <span className="rounded bg-muted px-2 py-1 text-muted-foreground">Речь с {plan.speechStartsAtSeconds.toFixed(1)} сек</span>
        <span className="rounded bg-muted px-2 py-1 text-muted-foreground">Продукт: {plan.productRole}</span>
        {strategy ? (
          <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
            CTA: {ctaLabel(strategy.ctaMode)}{strategy.ctaValue ? ` · ${strategy.ctaValue}` : ""}
          </span>
        ) : null}
        {validation ? (
          <span className={`rounded px-2 py-1 font-semibold ${validation.valid ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}`}>
            Prompt {validation.score}/100
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid gap-1 text-muted-foreground">
        {(plan.continuityProps || []).length ? (
          <p>
            <span className="font-semibold text-foreground">Постоянные предметы:</span>{" "}
            {(plan.continuityProps || []).map((item) => `${item.name}: ${item.appearance}`).join("; ")}
          </p>
        ) : null}
        {plan.beats.map((beat) => (
          <p key={`${beat.startSeconds}-${beat.endSeconds}`}>
            <span className="font-semibold text-foreground">{beat.startSeconds}-{beat.endSeconds}:</span> {beat.action}
          </p>
        ))}
      </div>
    </div>
  );
}

function ctaLabel(mode: OmniCreativeStrategy["ctaMode"]) {
  if (mode === "keyword_in_comments") return "слово в комментариях";
  if (mode === "link_in_profile") return "ссылка в профиле";
  if (mode === "no_explicit_cta") return "без прямого CTA";
  return "артикул в описании";
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
