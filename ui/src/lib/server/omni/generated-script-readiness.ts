import pool from "@/lib/db";

type ScriptReadinessInput = {
  status: string;
  script: string;
  source_snapshot: Record<string, unknown> | null;
};

/** Draft is editable, but only a draft that completed validation may incur media costs. */
export function assertGeneratedScriptReady(script: ScriptReadinessInput) {
  const snapshot = script.source_snapshot || {};
  const error = typeof snapshot.generation_error === "string" ? snapshot.generation_error.trim() : "";
  const failedCheck = [snapshot.quality_check, snapshot.semantic_review].some((check) =>
    check && typeof check === "object" && "passed" in check && check.passed === false);
  if (error || failedCheck || !["draft", "approved"].includes(script.status) || !script.script.trim()) {
    throw new Error(`Сценарий требует исправления перед генерацией: ${error || "текст ещё не прошёл проверку"}`);
  }
}

export async function assertStoredGeneratedScriptReady(input: { scriptId: number; projectId: number; productId: number; expectedScript?: string }, db: Pick<typeof pool, "query"> = pool) {
  const { rows } = await db.query<ScriptReadinessInput>(
    "SELECT status, script, source_snapshot FROM omni_generated_scripts WHERE id = $1 AND project_id = $2 AND product_id = $3",
    [input.scriptId, input.projectId, input.productId],
  );
  if (!rows[0]) throw new Error("Сценарий требует исправления перед генерацией: исходный сценарий не найден");
  assertGeneratedScriptReady(rows[0]);
  if (input.expectedScript !== undefined && rows[0].script !== input.expectedScript) {
    throw new Error("Сценарий изменился: подготовьте раскадровку заново.");
  }
}
