"use client";

import { Check, Power, RotateCcw, Trash2 } from "lucide-react";
import type { OmniClientAvatar } from "@/lib/omni/types";

type AvatarPreviewPanelProps = {
  avatars: OmniClientAvatar[];
  selectedAvatar: OmniClientAvatar | null;
  isBusy: boolean;
  onApprove: (avatar: OmniClientAvatar) => void;
  onRetry: (avatar: OmniClientAvatar) => void;
  onDelete: (avatar: OmniClientAvatar) => void;
  onRename: (avatar: OmniClientAvatar, nextName: string) => void;
  onToggleActive: (avatar: OmniClientAvatar) => void;
};

export function AvatarPreviewPanel({
  avatars,
  selectedAvatar,
  isBusy,
  onApprove,
  onRetry,
  onDelete,
  onRename,
  onToggleActive,
}: AvatarPreviewPanelProps) {
  return (
    <aside className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Превью аватара</p>
        {selectedAvatar ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onApprove(selectedAvatar)}
              disabled={isBusy || selectedAvatar.status === "approved"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
              title="Одобрить аватар"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onRetry(selectedAvatar)}
              disabled={isBusy}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
              title="Повторить генерацию"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(selectedAvatar)}
              disabled={isBusy}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
              title="Удалить генерацию"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      {selectedAvatar?.reference_url ? (
        <img
          src={selectedAvatar.reference_url}
          alt="Текущий аватар бренда"
          className="mt-4 aspect-[3/4] w-full rounded-lg border border-border object-cover"
        />
      ) : (
        <div className="mt-4 flex aspect-[3/4] w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-center text-sm text-muted-foreground">
          Аватар пока не создан
        </div>
      )}

      {selectedAvatar ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Имя</span>
            <span className="truncate font-semibold text-foreground">
              {selectedAvatar.display_name || `Avatar #${selectedAvatar.id}`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Статус</span>
            <span className="font-semibold text-foreground">{selectedAvatar.status}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Использование</span>
            <span className="font-semibold text-foreground">
              {selectedAvatar.is_active ? "включен" : "выключен"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Хранилище</span>
            <span className="font-semibold text-foreground">
              {selectedAvatar.provider === "manual_reference" ? "reference URL" : "S3"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Модель</span>
            <span className="font-semibold text-foreground">{selectedAvatar.provider}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">KIE character</span>
            <span className="max-w-40 truncate font-semibold text-foreground">
              {selectedAvatar.kie_character_id || "не создан"}
            </span>
          </div>
        </div>
      ) : null}

      <div className="border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Все аватары бренда</p>
        <div className="mt-3 space-y-2">
          {avatars.length ? (
            avatars.map((avatar) => (
              <div
                key={avatar.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-2"
              >
                {avatar.reference_url ? (
                  <img
                    src={avatar.reference_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-md border border-dashed border-border bg-muted/30" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <input
                      defaultValue={avatar.display_name || `Avatar #${avatar.id}`}
                      onBlur={(event) => {
                        const nextName = event.currentTarget.value.trim();
                        if (nextName !== (avatar.display_name || `Avatar #${avatar.id}`)) {
                          onRename(avatar, nextName);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                      disabled={isBusy}
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground outline-none transition focus:border-border focus:bg-card disabled:opacity-60"
                      title="Имя аватара"
                    />
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        avatar.is_active ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {avatar.is_active ? "on" : "off"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {avatar.provider} · {avatar.status}
                    {avatar.kie_character_id ? " · KIE ready" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleActive(avatar)}
                  disabled={isBusy}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    avatar.is_active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  title={avatar.is_active ? "Выключить аватар" : "Включить аватар"}
                >
                  <Power className="h-4 w-4" />
                </button>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              В этом бренде пока нет аватаров
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
