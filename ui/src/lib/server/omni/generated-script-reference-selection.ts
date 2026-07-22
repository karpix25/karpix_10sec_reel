import type { OmniLegacyScenario } from "@/lib/omni/types";
import type { OmniDirectorAnalysis } from "./director-analysis-types";
import type { GeneratedScriptSourceMode } from "./generated-script-source";

export const MAX_DIRECTOR_REFERENCE_ATTEMPTS = 8;

export type ResolvedGeneratedScriptReference = {
  sourceScenario: OmniLegacyScenario;
  sourceMode: GeneratedScriptSourceMode;
  directorAnalysis: OmniDirectorAnalysis | null;
};

export async function resolveReadyGeneratedScriptReference(input: {
  projectId: number;
  productId: number;
  legacyScenarioId?: number | null;
  maxAttempts?: number;
  resolveSource: (input: {
    projectId: number;
    productId: number;
    legacyScenarioId?: number | null;
    excludedLegacyScenarioIds?: readonly number[];
  }) => Promise<{ sourceScenario: OmniLegacyScenario; sourceMode: GeneratedScriptSourceMode }>;
  shouldAnalyze: (sourceScenario: OmniLegacyScenario) => boolean;
  ensureAnalysis: (input: {
    projectId: number;
    productId: number;
    sourceScenario: OmniLegacyScenario;
  }) => Promise<OmniDirectorAnalysis>;
  warn?: (message: string) => void;
}): Promise<ResolvedGeneratedScriptReference> {
  const maxAttempts = input.maxAttempts || MAX_DIRECTOR_REFERENCE_ATTEMPTS;
  const excludedLegacyScenarioIds: number[] = [];
  const skippedFailures: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const source = await resolveSourceOrThrow({
      input,
      attempt,
      excludedLegacyScenarioIds,
      skippedFailures,
    });
    const directorAnalysis = input.shouldAnalyze(source.sourceScenario)
      ? await input.ensureAnalysis({
          projectId: input.projectId,
          productId: input.productId,
          sourceScenario: source.sourceScenario,
        })
      : null;

    if (isDirectorReferenceReady(directorAnalysis)) {
      return {
        ...source,
        directorAnalysis,
      };
    }

    excludedLegacyScenarioIds.push(source.sourceScenario.id);
    skippedFailures.push(formatSkippedDirectorReference(source.sourceScenario.id, directorAnalysis));
    input.warn?.(`Skipping failed Omni reference source #${source.sourceScenario.id}: ${getDirectorFailureReason(directorAnalysis)}`);
  }

  throw new Error(
    [
      `Не удалось подобрать рабочий reference video после ${maxAttempts} попыток.`,
      skippedFailures.length ? `Пропущенные sources: ${skippedFailures.join("; ")}` : "",
      "Проверьте активный reference bundle или повторите позже.",
    ].filter(Boolean).join(" ")
  );
}

async function resolveSourceOrThrow(input: {
  input: Parameters<typeof resolveReadyGeneratedScriptReference>[0];
  attempt: number;
  excludedLegacyScenarioIds: readonly number[];
  skippedFailures: readonly string[];
}) {
  try {
    return await input.input.resolveSource({
      projectId: input.input.projectId,
      productId: input.input.productId,
      legacyScenarioId: input.attempt === 1 ? input.input.legacyScenarioId : null,
      excludedLegacyScenarioIds: input.excludedLegacyScenarioIds,
    });
  } catch (error) {
    if (!input.skippedFailures.length) throw error;
    throw new Error(
      [
        "Не удалось подобрать новый reference после пропуска нерабочих video.",
        `Пропущенные sources: ${input.skippedFailures.join("; ")}`,
        error instanceof Error ? error.message : String(error),
      ].join(" ")
    );
  }
}

function isDirectorReferenceReady(directorAnalysis: OmniDirectorAnalysis | null) {
  return !directorAnalysis || directorAnalysis.director_analysis_status === "completed";
}

function formatSkippedDirectorReference(
  legacyScenarioId: number,
  directorAnalysis: OmniDirectorAnalysis | null
) {
  return `#${legacyScenarioId}: ${getDirectorFailureReason(directorAnalysis)}`;
}

function getDirectorFailureReason(directorAnalysis: OmniDirectorAnalysis | null) {
  if (!directorAnalysis) return "not_requested";
  return directorAnalysis.analysis_error || directorAnalysis.director_analysis_status;
}
