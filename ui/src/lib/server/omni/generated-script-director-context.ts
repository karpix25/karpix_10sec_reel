import pool from "@/lib/db";
import type { OmniGeneratedScript } from "@/lib/omni/types";
import {
  extractDirectorBriefFromSnapshot,
  normalizeDirectorBrief,
  type DirectorBrief,
} from "./director-analysis-types";
import { extractDirectorReferenceImageUrls } from "./director-reference-images";

type DirectorAnalysisScopeRow = {
  legacy_scenario_id: number | null;
  director_analysis_json: unknown;
  scrapecreators_payload: Record<string, unknown> | null;
  source_snapshot: Record<string, unknown> | null;
};

export type GeneratedScriptDirectorContext = {
  brief: DirectorBrief | null;
  referenceImageUrls: string[];
  scoped: boolean;
  sourceSnapshot: Record<string, unknown> | null;
};

export async function resolveGeneratedScriptDirectorContext(input: {
  generatedScript: OmniGeneratedScript;
}): Promise<GeneratedScriptDirectorContext> {
  const analysisId = input.generatedScript.director_analysis_id;
  if (!analysisId) {
    return {
      brief: extractDirectorBriefFromSnapshot(input.generatedScript.source_snapshot),
      referenceImageUrls: extractDirectorReferenceImageUrls({
        sourceSnapshot: input.generatedScript.source_snapshot,
      }),
      scoped: true,
      sourceSnapshot: asRecord(input.generatedScript.source_snapshot),
    };
  }

  const { rows } = await pool.query<DirectorAnalysisScopeRow>(
    `SELECT legacy_scenario_id, director_analysis_json, scrapecreators_payload, source_snapshot
     FROM omni_legacy_video_analyses
     WHERE id = $1
     LIMIT 1`,
    [analysisId]
  );
  const analysis = rows[0];
  if (!analysis) {
    throw new Error(
      `Director analysis ${analysisId} is missing for generated script ${input.generatedScript.id}`
    );
  }

  const referenceMismatch = input.generatedScript.source_legacy_scenario_id !== null &&
    analysis.legacy_scenario_id !== null &&
    Number(analysis.legacy_scenario_id) !== Number(input.generatedScript.source_legacy_scenario_id);
  if (referenceMismatch) {
    throw new Error(
      `Director analysis ${analysisId} is for legacy reference ${analysis.legacy_scenario_id}, ` +
      `but generated script ${input.generatedScript.id} uses legacy reference ${input.generatedScript.source_legacy_scenario_id}`
    );
  }

  const brief = normalizeDirectorBrief(analysis.director_analysis_json) ||
    extractDirectorBriefFromSnapshot(input.generatedScript.source_snapshot);
  const referenceImageUrls = extractDirectorReferenceImageUrls({
    directorAnalysis: analysis,
    sourceSnapshot: input.generatedScript.source_snapshot,
  });
  return {
    brief,
    referenceImageUrls,
    scoped: true,
    sourceSnapshot: asRecord(input.generatedScript.source_snapshot),
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
