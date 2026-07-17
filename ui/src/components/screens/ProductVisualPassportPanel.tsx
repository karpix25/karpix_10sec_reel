"use client";

import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OmniProduct } from "@/lib/omni/types";

export function ProductVisualPassportPanel({
  product,
  isAnalyzing,
  onAnalyze,
}: {
  product: OmniProduct;
  isAnalyzing: boolean;
  onAnalyze: () => void;
}) {
  const profile = product.product_visual_profile;

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Паспорт продукта из ref
            <Badge variant={getProfileBadgeVariant(product.product_visual_profile_status)}>
              {getProfileStatusLabel(product.product_visual_profile_status)}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {profile?.prompt_summary || "Паспорт продукта пока не собран из ref-картинок."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onAnalyze}
          disabled={!product.product_refs.length || isAnalyzing}
          className="min-h-10 shrink-0"
        >
          {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isAnalyzing ? "Анализирую" : "Обновить паспорт"}
        </Button>
      </div>
      {profile ? (
        <div className="grid gap-2 text-xs leading-5 text-muted-foreground">
          {renderProfileLine("Форма", profile.physical_form)}
          {renderProfileLine("Упаковка", profile.package_type)}
          {renderProfileLine("Цвета", profile.colors.join(", "))}
          {renderProfileLine("Материал", profile.materials_finish.join(", "))}
          {renderProfileLine("Размер", profile.size_proportions)}
          {renderProfileLine("Этикетка", profile.labels_text_logo_placement)}
        </div>
      ) : null}
      {product.product_visual_profile_error ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{product.product_visual_profile_error}</span>
        </div>
      ) : null}
      {!product.product_refs.length ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Для анализа нужна хотя бы одна картинка продукта.
        </p>
      ) : null}
    </div>
  );
}

function getProfileStatusLabel(status: OmniProduct["product_visual_profile_status"]) {
  if (status === "completed") return "готов";
  if (status === "processing") return "анализ идет";
  if (status === "failed") return "ошибка";
  return "не собран";
}

function getProfileBadgeVariant(status: OmniProduct["product_visual_profile_status"]): BadgeProps["variant"] {
  if (status === "completed") return "success";
  if (status === "failed") return "destructive";
  if (status === "processing") return "secondary";
  return "outline";
}

function renderProfileLine(label: string, value: string) {
  if (!value) return null;
  return (
    <p key={label}>
      <span className="font-semibold text-foreground">{label}:</span> {value}
    </p>
  );
}
