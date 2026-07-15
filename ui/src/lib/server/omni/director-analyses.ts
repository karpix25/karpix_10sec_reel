import pool from "@/lib/db";
import type { OmniLegacyScenario } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { DIRECTOR_ANALYSIS_PROMPT_VERSION } from "./director-analysis-prompt";
import { storeDirectorReferenceVideo } from "./director-video-storage";
import { analyzeDirectorVideo } from "./openrouter-director-analysis-client";
import { resolveInstagramVideoWithScrapeCreators } from "./scrapecreators-client";
import type { OmniDirectorAnalysis } from "./director-analysis-types";

const LEGACY_SOURCE = "old_db";

type DirectorAnalysisRow = Omit<
  OmniDirectorAnalysis,
  "legacy_scenario_id" | "source_legacy_client_id"
> & {
  legacy_scenario_id: string | number;
  source_legacy_client_id: string | number | null;
};

export async function getDirectorAnalysisForLegacy(input: {
  legacyScenarioId: number;
  promptVersion?: string;
}) {
  await ensureOmniSchema();
  const { rows } = await pool.query<DirectorAnalysisRow>(
    `SELECT *
     FROM omni_legacy_video_analyses
     WHERE legacy_source = $1
       AND legacy_scenario_id = $2
       AND analysis_prompt_version = $3
     LIMIT 1`,
    [LEGACY_SOURCE, input.legacyScenarioId, input.promptVersion || DIRECTOR_ANALYSIS_PROMPT_VERSION]
  );
  return rows[0] ? normalizeAnalysis(rows[0]) : null;
}

export async function ensureDirectorAnalysis(input: {
  projectId: number;
  productId: number;
  sourceScenario: OmniLegacyScenario;
}) {
  await ensureOmniSchema();
  const existing = await getDirectorAnalysisForLegacy({ legacyScenarioId: input.sourceScenario.id });
  if (existing?.director_analysis_status === "completed") return existing;

  const row = await upsertPendingAnalysis(input);
  return runDirectorAnalysis(row.id, input.sourceScenario);
}

async function upsertPendingAnalysis(input: {
  projectId: number;
  productId: number;
  sourceScenario: OmniLegacyScenario;
}) {
  const sourceSnapshot = {
    id: input.sourceScenario.id,
    legacy_client_id: input.sourceScenario.client_id,
    legacy_client_name: input.sourceScenario.legacy_client_name,
    legacy_product_keyword: input.sourceScenario.legacy_product_keyword,
    title: input.sourceScenario.title,
    topic: input.sourceScenario.topic,
    reels_url: input.sourceScenario.reels_url,
    word_count: input.sourceScenario.word_count,
    duration_seconds: input.sourceScenario.duration_seconds,
  };
  const { rows } = await pool.query<DirectorAnalysisRow>(
    `INSERT INTO omni_legacy_video_analyses (
       project_id,
       product_id,
       legacy_source,
       legacy_scenario_id,
       source_legacy_client_id,
       original_reels_url,
       source_snapshot,
       director_analysis_status,
       analysis_prompt_version,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'pending', $8, CURRENT_TIMESTAMP)
     ON CONFLICT (legacy_source, legacy_scenario_id, analysis_prompt_version)
     DO UPDATE SET
       project_id = COALESCE(omni_legacy_video_analyses.project_id, EXCLUDED.project_id),
       product_id = COALESCE(omni_legacy_video_analyses.product_id, EXCLUDED.product_id),
       original_reels_url = COALESCE(EXCLUDED.original_reels_url, omni_legacy_video_analyses.original_reels_url),
       source_snapshot = EXCLUDED.source_snapshot,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      input.projectId,
      input.productId,
      LEGACY_SOURCE,
      input.sourceScenario.id,
      input.sourceScenario.client_id,
      input.sourceScenario.reels_url,
      JSON.stringify(sourceSnapshot),
      DIRECTOR_ANALYSIS_PROMPT_VERSION,
    ]
  );
  return normalizeAnalysis(rows[0]);
}

async function runDirectorAnalysis(analysisId: number, sourceScenario: OmniLegacyScenario) {
  await markProcessing(analysisId);

  try {
    if (!sourceScenario.reels_url) throw new Error("Legacy scenario has no reels_url");

    const resolved = await resolveInstagramVideoWithScrapeCreators(sourceScenario.reels_url);
    let storedVideoUrl: string | null = null;
    let storageStatus = "skipped";
    let storageError: string | null = null;
    try {
      const stored = await storeDirectorReferenceVideo({
        legacyScenarioId: sourceScenario.id,
        videoUrl: resolved.videoUrl,
      });
      storedVideoUrl = stored?.url || null;
      storageStatus = stored ? "completed" : "skipped";
    } catch (error) {
      storageStatus = "failed";
      storageError = formatError(error);
    }

    const videoUrlForAnalysis = storedVideoUrl || resolved.videoUrl;
    const analyzed = await analyzeDirectorVideo({
      videoUrl: videoUrlForAnalysis,
      transcript: sourceScenario.script,
    });

    const { rows } = await pool.query<DirectorAnalysisRow>(
      `UPDATE omni_legacy_video_analyses
       SET resolved_video_url = $2,
           stored_video_url = $3,
           video_storage_status = $4,
           video_storage_error = $5,
           scrapecreators_payload = $6::jsonb,
           director_analysis_status = 'completed',
           director_analysis_json = $7::jsonb,
           analysis_model = $8,
           analysis_error = NULL,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        analysisId,
        resolved.videoUrl,
        storedVideoUrl,
        storageStatus,
        storageError,
        JSON.stringify(resolved.metadata),
        JSON.stringify(analyzed.brief),
        analyzed.model,
      ]
    );
    return normalizeAnalysis(rows[0]);
  } catch (error) {
    const { rows } = await pool.query<DirectorAnalysisRow>(
      `UPDATE omni_legacy_video_analyses
       SET director_analysis_status = 'failed',
           analysis_error = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [analysisId, formatError(error)]
    );
    return normalizeAnalysis(rows[0]);
  }
}

async function markProcessing(analysisId: number) {
  await pool.query(
    `UPDATE omni_legacy_video_analyses
     SET director_analysis_status = 'processing',
         analysis_error = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [analysisId]
  );
}

function normalizeAnalysis(row: DirectorAnalysisRow): OmniDirectorAnalysis {
  return {
    ...row,
    id: Number(row.id),
    project_id: row.project_id === null ? null : Number(row.project_id),
    product_id: row.product_id === null ? null : Number(row.product_id),
    legacy_scenario_id: Number(row.legacy_scenario_id),
    source_legacy_client_id: row.source_legacy_client_id === null ? null : Number(row.source_legacy_client_id),
  };
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
}
