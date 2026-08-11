import pool from "@/lib/db";
import {
  summarizeOmniGenerationCosts,
  type OmniGenerationCostEvent,
  type OmniGenerationCostOperation,
  type OmniGenerationCostSummary,
} from "@/lib/omni/generation-cost";
import { extractOpenRouterCostSummaryFromSnapshot } from "@/lib/omni/openrouter-cost";
import type { OmniGeneratedScript } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";

const DEFAULT_KIE_USD_PER_CREDIT = 0.01;

type CostRow = {
  generated_script_id: number | null;
  external_task_id: string;
  operation: OmniGenerationCostOperation;
  status: string;
  credits_consumed: string | number | null;
  cost_usd: string | number | null;
  cost_is_estimated: boolean;
};

export async function recordKieGenerationCost(input: {
  projectId: number;
  productId: number;
  generatedScriptId?: number | null;
  reelId?: number | null;
  reelSegmentId?: number | null;
  operation: OmniGenerationCostOperation;
  taskId: string;
  status: string;
  model: string;
  raw: unknown;
}) {
  if (!input.taskId.trim()) return;
  await ensureOmniSchema();
  const creditsConsumed = extractKieCreditsConsumed(input.raw);
  const rate = getKieUsdPerCredit();
  const costUsd = creditsConsumed === null ? null : creditsConsumed * rate.value;

  await pool.query(
    `INSERT INTO omni_generation_cost_events (
       project_id,
       product_id,
       generated_script_id,
       reel_id,
       reel_segment_id,
       provider,
       operation,
       external_task_id,
       model,
       status,
       credits_consumed,
       cost_usd,
       cost_is_estimated,
       raw_payload,
       completed_at
     )
     VALUES ($1, $2, $3, $4, $5, 'kie-ai', $6, $7, $8, $9, $10, $11, $12, $13::jsonb,
       CASE WHEN $9 IN ('completed', 'failed', 'error') THEN CURRENT_TIMESTAMP ELSE NULL END)
     ON CONFLICT (provider, external_task_id)
     DO UPDATE SET
       generated_script_id = COALESCE(EXCLUDED.generated_script_id, omni_generation_cost_events.generated_script_id),
       reel_id = COALESCE(EXCLUDED.reel_id, omni_generation_cost_events.reel_id),
       reel_segment_id = COALESCE(EXCLUDED.reel_segment_id, omni_generation_cost_events.reel_segment_id),
       model = COALESCE(NULLIF(EXCLUDED.model, ''), omni_generation_cost_events.model),
       status = EXCLUDED.status,
       credits_consumed = COALESCE(EXCLUDED.credits_consumed, omni_generation_cost_events.credits_consumed),
       cost_usd = COALESCE(EXCLUDED.cost_usd, omni_generation_cost_events.cost_usd),
       cost_is_estimated = EXCLUDED.cost_is_estimated,
       raw_payload = EXCLUDED.raw_payload,
       completed_at = COALESCE(omni_generation_cost_events.completed_at, EXCLUDED.completed_at),
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.projectId,
      input.productId,
      input.generatedScriptId || null,
      input.reelId || null,
      input.reelSegmentId || null,
      input.operation,
      input.taskId,
      input.model,
      input.status.toLowerCase(),
      creditsConsumed,
      costUsd,
      rate.isEstimated,
      JSON.stringify(input.raw || {}),
    ]
  );
}

export async function getGeneratedScriptCostSummaries(scripts: readonly OmniGeneratedScript[]) {
  if (!scripts.length) return new Map<number, OmniGenerationCostSummary>();
  await ensureOmniSchema();
  const scriptIds = scripts.map((script) => script.id);
  const events = await getStoredCostEvents(scriptIds);
  const knownTaskIds = new Set(events.map(({ event }) => event.taskId));
  const legacyEvents = await getLegacyVideoCostEvents(scriptIds, knownTaskIds);
  const eventsByScript = groupEventsByScript([...events, ...legacyEvents]);

  return new Map(
    scripts.map((script) => {
      const openRouter = extractOpenRouterCostSummaryFromSnapshot(script.source_snapshot);
      const openRouterUsd = openRouter?.costUsd ?? openRouter?.estimatedCostUsd ?? null;
      return [
        script.id,
        summarizeOmniGenerationCosts({
          openRouterUsd,
          openRouterCostIsEstimated: openRouter?.costUsd === null,
          events: eventsByScript.get(script.id) || [],
        }),
      ];
    })
  );
}

async function getStoredCostEvents(scriptIds: number[]) {
  const { rows } = await pool.query<CostRow>(
    `SELECT COALESCE(cost.generated_script_id, reel.source_generated_script_id)::int AS generated_script_id,
            cost.external_task_id,
            cost.operation,
            cost.status,
            cost.credits_consumed,
            cost.cost_usd,
            cost.cost_is_estimated
     FROM omni_generation_cost_events cost
     LEFT JOIN omni_reels reel ON reel.id = cost.reel_id
     WHERE cost.provider = 'kie-ai'
       AND COALESCE(cost.generated_script_id, reel.source_generated_script_id) = ANY($1::int[])`,
    [scriptIds]
  );
  return rowsToEvents(rows);
}

async function getLegacyVideoCostEvents(scriptIds: number[], knownTaskIds: Set<string>) {
  const { rows } = await pool.query<{
    generated_script_id: number;
    external_task_id: string;
    status: string;
    response_payload: unknown;
  }>(
    `SELECT reel.source_generated_script_id::int AS generated_script_id,
            segment.kie_task_id AS external_task_id,
            segment.status,
            segment.response_payload
     FROM omni_reels reel
     JOIN omni_reel_segments segment ON segment.reel_id = reel.id
     WHERE reel.source_generated_script_id = ANY($1::int[])
       AND segment.generation_provider = 'kie-ai'
       AND segment.kie_task_id IS NOT NULL`,
    [scriptIds]
  );
  const rate = getKieUsdPerCredit();

  return rows
    .filter((row) => !knownTaskIds.has(row.external_task_id))
    .map((row) => {
      const creditsConsumed = extractKieCreditsConsumed(row.response_payload);
      return {
        generatedScriptId: row.generated_script_id,
        event: {
          taskId: row.external_task_id,
          operation: "video" as const,
          status: row.status,
          creditsConsumed,
          costUsd: creditsConsumed === null ? null : creditsConsumed * rate.value,
          costIsEstimated: rate.isEstimated,
        },
      };
    });
}

function rowsToEvents(rows: readonly CostRow[]) {
  return rows
    .filter((row) => Number.isInteger(Number(row.generated_script_id)))
    .map((row) => ({
      generatedScriptId: Number(row.generated_script_id),
      event: {
        taskId: row.external_task_id,
        operation: row.operation,
        status: row.status,
        creditsConsumed: toNumber(row.credits_consumed),
        costUsd: toNumber(row.cost_usd),
        costIsEstimated: row.cost_is_estimated,
      },
    }));
}

function groupEventsByScript(entries: readonly { generatedScriptId: number; event: OmniGenerationCostEvent }[]) {
  const grouped = new Map<number, OmniGenerationCostEvent[]>();
  for (const entry of entries) {
    grouped.set(entry.generatedScriptId, [...(grouped.get(entry.generatedScriptId) || []), entry.event]);
  }
  return grouped;
}

function getKieUsdPerCredit() {
  const configured = toNumber(process.env.KIE_USD_PER_CREDIT);
  return configured !== null && configured >= 0
    ? { value: configured, isEstimated: false }
    : { value: DEFAULT_KIE_USD_PER_CREDIT, isEstimated: true };
}

export function extractKieCreditsConsumed(raw: unknown): number | null {
  const record = toRecord(raw);
  if (!record) return null;
  return toNumber(record.creditsConsumed) ?? toNumber(record.credits_consumed) ?? extractKieCreditsConsumed(record.data);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
