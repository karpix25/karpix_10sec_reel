import { Input } from "@/components/ui/input";
import type { CtaMode } from "@/lib/omni/creative-contract";

const CTA_OPTIONS: Array<{ value: CtaMode; label: string }> = [
  { value: "article_in_description", label: "Артикул в описании" },
  { value: "keyword_in_comments", label: "Кодовое слово в комментариях" },
  { value: "link_in_profile", label: "Ссылка в профиле" },
  { value: "no_explicit_cta", label: "Без явного CTA" },
];

export function ProductCtaFields({
  mode,
  value,
  onChange,
  disabled = false,
}: {
  mode: CtaMode;
  value: string;
  onChange: (next: { mode: CtaMode; value: string }) => void;
  disabled?: boolean;
}) {
  const needsValue = mode === "keyword_in_comments" || mode === "link_in_profile";
  return (
    <div className="grid gap-2">
      <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        CTA роликов
        <select
          value={mode}
          onChange={(event) => {
            const nextMode = event.target.value as CtaMode;
            const keepValue = nextMode === "keyword_in_comments" || nextMode === "link_in_profile";
            onChange({ mode: nextMode, value: keepValue ? value : "" });
          }}
          disabled={disabled}
          className="h-11 rounded-lg border border-input bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {CTA_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      {needsValue ? (
        <Input
          value={value}
          onChange={(event) => onChange({ mode, value: event.target.value })}
          disabled={disabled}
          placeholder={mode === "keyword_in_comments" ? "Например: КОЛЛАГЕН" : "Например: ссылка в шапке профиля"}
          className="h-11"
        />
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">
        CTA берётся только из точного сценария: video prompt не дописывает новые слова.
      </p>
    </div>
  );
}

export function getCtaModeLabel(mode: CtaMode) {
  return CTA_OPTIONS.find((option) => option.value === mode)?.label || mode;
}
