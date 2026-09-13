"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditGeneratedScript } from "@/hooks/useEditGeneratedScript";
import type { OmniGeneratedScript } from "@/lib/omni/types";

export function GeneratedScriptEditor({ script, projectId, productId }: {
  script: OmniGeneratedScript; projectId: number; productId: number;
}) {
  const [text, setText] = useState(script.script);
  const [editing, setEditing] = useState(false);
  const save = useEditGeneratedScript();
  const validationError = typeof script.source_snapshot?.generation_error === "string"
    ? script.source_snapshot.generation_error : "";
  const error = save.error?.message || validationError;
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      {error ? <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{error}</p> : null}
      {editing ? (
        <>
          <label htmlFor={`script-edit-${script.id}`} className="block text-sm font-medium">Текст сценария</label>
          <textarea id={`script-edit-${script.id}`} value={text} onChange={(event) => setText(event.target.value)}
            disabled={save.isPending} maxLength={10_000} rows={7}
            className="w-full rounded-md border border-input bg-background p-3 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-ring" />
          <p className="text-xs text-muted-foreground">Сохранение запускает проверку текста и длительности. Видео не генерируется.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={save.isPending || !text.trim()} onClick={() => {
              save.mutate({ projectId, productId, scriptId: script.id, script: text }, {
                onSuccess: (saved) => { if (!saved.source_snapshot?.generation_error) setEditing(false); },
              });
            }}>{save.isPending ? "Проверяем текст…" : "Сохранить и проверить"}</Button>
            <Button variant="outline" disabled={save.isPending} onClick={() => setEditing(false)}>Отмена</Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => { setText(script.script); save.reset(); setEditing(true); }}>Редактировать сценарий</Button>
          <p className="text-xs text-muted-foreground" role="status">{validationError ? "Черновик сохранён. Исправьте текст перед генерацией." : save.isSuccess ? "Текст прошёл проверку." : ""}</p>
        </div>
      )}
    </div>
  );
}
