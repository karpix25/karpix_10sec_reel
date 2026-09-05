import type { OmniLegacyScenario } from "@/lib/omni/types";
import { normalizeDirectorBrief, type OmniDirectorAnalysis } from "./director-analysis-types";
import { isAvatarFreeVisibleSubjectPolicy, resolveDirectorVisibleSubjectPolicy } from "./director-visibility-policy";
import type { GeneratedScriptSourceMode } from "./generated-script-source";
import { hasCompleteSourceTimeline } from "./omni-reference-transfer-policy";
import { classifyDirectorProviderFailure } from "./director-analysis-retry";

export const MAX_DIRECTOR_REFERENCE_ATTEMPTS = 16;

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
  onSourceAttempted?: (sourceScenario: OmniLegacyScenario) => Promise<void>;
  requireVisibleAvatar?: boolean;
  requireCompleteTimeline?: boolean;
  warn?: (message: string) => void;
}): Promise<ResolvedGeneratedScriptReference> {
  const maxAttempts = input.maxAttempts || MAX_DIRECTOR_REFERENCE_ATTEMPTS;
  const excludedLegacyScenarioIds: number[] = [];
  const skippedFailures: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const source = await resolveSourceOrThrow({
      input,
      excludedLegacyScenarioIds,
      skippedFailures,
    });
    if (input.legacyScenarioId && source.sourceScenario.id !== input.legacyScenarioId) {
      throw new Error(`Выбранный референс #${input.legacyScenarioId} не найден. Другой источник не подставлен.`);
    }
    const explicitlySelected = Boolean(input.legacyScenarioId) || source.sourceMode === "selected_legacy_reference";
    const directorAnalysis = input.shouldAnalyze(source.sourceScenario)
      ? await input.ensureAnalysis({
          projectId: input.projectId,
          productId: input.productId,
          sourceScenario: source.sourceScenario,
        })
      : null;

    const directorBrief = normalizeDirectorBrief(directorAnalysis?.director_analysis_json);
    const failureReason = !isDirectorReferenceReady(directorAnalysis)
      ? getDirectorFailureReason(directorAnalysis)
      : input.requireCompleteTimeline && !hasCompleteSourceTimeline(directorBrief)
        ? "неполный визуальный таймлайн; повторите анализ референса"
        : null;
    const providerFailure = classifyDirectorProviderFailure(failureReason);
    if (providerFailure) {
      throw new Error(`Не удалось разобрать reference video #${source.sourceScenario.id}: ` +
        `${providerFailure === "credits" ? "провайдер требует пополнить баланс" : "провайдер отказал в доступе"}. ` +
        `Подбор остановлен, референс не пропущен. Восстановите доступ к провайдеру и повторите запуск. ${failureReason}`);
    }
    if (!explicitlySelected && source.sourceMode === "round_robin_active_legacy_reference") {
      await input.onSourceAttempted?.(source.sourceScenario);
    }
    if (!failureReason) {
      const visibleSubjectPolicy = resolveDirectorVisibleSubjectPolicy(directorBrief);
      if (
        input.requireVisibleAvatar &&
        !explicitlySelected &&
        isAvatarFreeVisibleSubjectPolicy(visibleSubjectPolicy)
      ) {
        excludedLegacyScenarioIds.push(source.sourceScenario.id);
        skippedFailures.push(`#${source.sourceScenario.id}: avatar-incompatible: ${visibleSubjectPolicy}`);
        input.warn?.(`Skipping avatar-incompatible Omni reference source #${source.sourceScenario.id}: ${visibleSubjectPolicy}`);
        continue;
      }
      return {
        ...source,
        directorAnalysis,
      };
    }

    if (explicitlySelected) {
      throw new Error(`Не удалось разобрать reference video #${source.sourceScenario.id}: ${failureReason}. Выбранный референс сохранён, другой источник не подставлен.`);
    }
    excludedLegacyScenarioIds.push(source.sourceScenario.id);
    skippedFailures.push(`#${source.sourceScenario.id}: ${failureReason}`);
    input.warn?.(`Skipping failed Omni reference source #${source.sourceScenario.id}: ${failureReason}`);
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
  excludedLegacyScenarioIds: readonly number[];
  skippedFailures: readonly string[];
}) {
  try {
    return await input.input.resolveSource({
      projectId: input.input.projectId,
      productId: input.input.productId,
      legacyScenarioId: input.input.legacyScenarioId,
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
  return !directorAnalysis ||
    (directorAnalysis.director_analysis_status === "completed" &&
      hasDurableDirectorReference(directorAnalysis) &&
      Boolean(normalizeDirectorBrief(directorAnalysis.director_analysis_json)));
}

function hasDurableDirectorReference(directorAnalysis: OmniDirectorAnalysis) {
  if (directorAnalysis.stored_video_url) return true;
  if (!directorAnalysis.original_reels_url && !directorAnalysis.resolved_video_url) return true;
  return false;
}

function getDirectorFailureReason(directorAnalysis: OmniDirectorAnalysis | null) {
  if (!directorAnalysis) return "not_requested";
  if (directorAnalysis.director_analysis_status === "completed" && !normalizeDirectorBrief(directorAnalysis.director_analysis_json)) {
    return "director analysis is invalid";
  }
  if (directorAnalysis.director_analysis_status === "completed" && !hasDurableDirectorReference(directorAnalysis)) {
    return directorAnalysis.video_storage_error || "reference video was analyzed but not stored durably";
  }
  return directorAnalysis.analysis_error || directorAnalysis.director_analysis_status;
}
