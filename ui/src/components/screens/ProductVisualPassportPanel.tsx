"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, Sparkles } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OmniProduct } from "@/lib/omni/types";

export function ProductVisualPassportPanel({
  product,
  isAnalyzing,
  isUpdatingPhysicalContract = false,
  onAnalyze,
  onGeneratePhysicalContract,
  onSavePhysicalContract,
}: {
  product: OmniProduct;
  isAnalyzing: boolean;
  isUpdatingPhysicalContract?: boolean;
  onAnalyze: () => void;
  onGeneratePhysicalContract?: (userInstruction: string) => void | Promise<unknown>;
  onSavePhysicalContract?: (contract: string) => void | Promise<unknown>;
}) {
  const profile = product.product_visual_profile;
  const [physicalDraft, setPhysicalDraft] = useState(product.product_physical_contract || "");
  const hasPhysicalChanges = physicalDraft.trim() !== (product.product_physical_contract || "").trim();

  useEffect(() => {
    setPhysicalDraft(product.product_physical_contract || "");
  }, [product.id, product.product_physical_contract]);

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
      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          Физика продукта в видео
          <Badge variant={getPhysicalBadgeVariant(product.product_physical_contract_status)}>
            {getPhysicalStatusLabel(product.product_physical_contract_status)}
          </Badge>
        </div>
        <p className="mb-2 text-xs leading-5 text-muted-foreground">
          Опиши, каким продукт остается в кадре: материал, консистенция, движение и стабильная форма.
        </p>
        <textarea
          value={physicalDraft}
          onChange={(event) => setPhysicalDraft(event.target.value)}
          placeholder="Например: продукт остается цельным мягким желе с глянцевой поверхностью, легко дрожит при касании и возвращается к той же форме."
          className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
        />
        {product.product_physical_contract_error ? (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{product.product_physical_contract_error}</span>
          </div>
        ) : null}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => void onGeneratePhysicalContract?.(physicalDraft)}
            disabled={!onGeneratePhysicalContract || isUpdatingPhysicalContract}
            className="min-h-10"
          >
            {isUpdatingPhysicalContract ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Сгенерировать
          </Button>
          <Button
            type="button"
            onClick={() => void onSavePhysicalContract?.(physicalDraft)}
            disabled={!onSavePhysicalContract || !hasPhysicalChanges || isUpdatingPhysicalContract}
            className="min-h-10"
          >
            <Check className="h-4 w-4" />
            Сохранить
          </Button>
        </div>
      </div>
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

function getPhysicalStatusLabel(status: OmniProduct["product_physical_contract_status"]) {
  if (status === "generated") return "сгенерирован";
  if (status === "edited") return "отредактирован";
  if (status === "failed") return "ошибка";
  return "не задан";
}

function getPhysicalBadgeVariant(status: OmniProduct["product_physical_contract_status"]): BadgeProps["variant"] {
  if (status === "generated" || status === "edited") return "success";
  if (status === "failed") return "destructive";
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
