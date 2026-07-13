import {
  OMNI_ACTION_SAFETY_RULES,
  OMNI_FORBIDDEN_MOTIFS,
  type CreativeScoreBreakdown,
  type CtaMode,
  type HookType,
  type LifeFormatId,
  type OmniCreativeStrategy,
  type OmniLifeFormat,
  type ProductRole,
} from "@/lib/omni/creative-contract";
import { OMNI_LIFE_FORMATS } from "./omni-life-formats";

export interface SelectOmniFormatInput {
  script: string;
  firstSpokenLine?: string | null;
  productName: string;
  productDescription?: string | null;
  targetAudience?: string | null;
  hasProductReference: boolean;
  ctaMode?: CtaMode;
  ctaValue?: string | null;
  recentFormatIds?: readonly LifeFormatId[];
}

type ScoredFormat = {
  format: OmniLifeFormat;
  score: CreativeScoreBreakdown;
};

const COMPLEX_ACTION_PATTERN = /одновременно|на ходу.*откр|за рулем|за рулём|беж|прыга|танцу|несколько предмет/i;
const INTANGIBLE_PRODUCT_PATTERN = /курс|сервис|услуг|приложен|страхов|банк|оплат|подписк|консультац/i;
const EXPLICIT_DEMO_PATTERN = /покаж|демонстр|как выглядит|упаковк|распаков/i;
const REPLACEMENT_PATTERN = /вместо|замени|больше не|раньше.*теперь|перестал|надоело/i;
const RESULT_PATTERN = /результат|получил|стало|теперь|наконец|сработал|эффект/i;
const PROBLEM_PATTERN = /проблем|не мог|не могла|устал|устала|мешал|неудоб|бол|мерзк|раздраж/i;
const SURPRISE_PATTERN = /не ожидал|не ожидала|оказалось|сюрприз|странн|никто не/i;

export function selectOmniCreativeStrategy(input: SelectOmniFormatInput): OmniCreativeStrategy {
  const story = normalize(input.script);
  const normalized = normalize([input.script, input.productName, input.productDescription].filter(Boolean).join(" "));
  const firstLine = normalize(input.firstSpokenLine || input.script.split(/[.!?]/, 1)[0] || input.script);
  const audience = normalize(input.targetAudience || "");
  const recent = input.recentFormatIds || [];
  const eligibleFormats = OMNI_LIFE_FORMATS.filter(
    (format) => format.id !== "habit_replacement" || REPLACEMENT_PATTERN.test(story)
  );
  const hasFormatSignal = eligibleFormats.some((format) => countPhraseHits(story, format.semanticKeywords) > 0);
  const ranked = (hasFormatSignal
    ? eligibleFormats.map((format) => scoreFormat(format, story, firstLine, normalized, audience, recent))
    : eligibleFormats
        .filter((format) => format.id === "moving_vlog")
        .map((format) => scoreFormat(format, story, firstLine, normalized, audience, recent))
  ).sort(compareScores);
  const bestScore = ranked[0]?.score.total ?? 0;
  const finalists = ranked.filter((candidate, index) => index < 3 && candidate.score.total >= bestScore - 0.75);
  const selected = finalists[stableHash(`${normalized}|${audience}`) % finalists.length] || ranked[0];
  if (!selected) throw new Error("Omni life format catalog is empty");

  const productRole = selectProductRole(selected.format, normalized, input.hasProductReference);
  const hookType = selectHookType(selected.format, firstLine, productRole);
  const sceneArc = pickStable(selected.format.sceneArcs, `${normalized}|${selected.format.id}`);

  return {
    version: "life-formats-v1",
    scope: "reel",
    lifeFormatId: selected.format.id,
    providerFormatDescription: selected.format.providerDescription,
    setting: sceneArc.setting,
    continuityProps: sceneArc.fixedProps,
    hookType,
    hookRule: buildHookRule(hookType),
    productRole,
    productActionRule: buildProductActionRule(productRole),
    ctaMode: input.ctaMode || "article_in_description",
    ctaValue: normalizeOptional(input.ctaValue),
    selectionReason: buildSelectionReason(selected),
    score: selected.score,
    forbiddenMotifs: [...new Set([...OMNI_FORBIDDEN_MOTIFS, ...selected.format.forbiddenMotifs])],
    safetyRules: [...new Set([...OMNI_ACTION_SAFETY_RULES, ...selected.format.safetyRules])],
  };
}

function scoreFormat(
  format: OmniLifeFormat,
  story: string,
  firstLine: string,
  content: string,
  audience: string,
  recent: readonly LifeFormatId[]
): ScoredFormat {
  const semanticHits = countPhraseHits(story, format.semanticKeywords);
  const openingHits = countPhraseHits(firstLine, format.semanticKeywords);
  const audienceHits = countPhraseHits(audience, format.audienceKeywords);
  const semanticFit = Math.min(5, semanticHits * 1.15 + openingHits * 1.5);
  const productNaturalness = scoreProductNaturalness(format, content, semanticHits);
  const audienceSettingFit = audience ? Math.min(2, audienceHits) : 1;
  const actionFeasibility = COMPLEX_ACTION_PATTERN.test(content) && format.actionComplexity === "medium" ? 0.5 : 2;
  const noveltyPenalty = getNoveltyPenalty(format, recent);
  const total = round(semanticFit + productNaturalness + audienceSettingFit + actionFeasibility - noveltyPenalty);
  return { format, score: { semanticFit, productNaturalness, audienceSettingFit, actionFeasibility, noveltyPenalty, total } };
}

function scoreProductNaturalness(format: OmniLifeFormat, content: string, semanticHits: number) {
  if (INTANGIBLE_PRODUCT_PATTERN.test(content)) return format.allowedProductRoles.includes("hidden") ? 3 : 0;
  if (REPLACEMENT_PATTERN.test(content) && format.id === "habit_replacement") return 3;
  if (semanticHits === 0 && !["moving_vlog", "facetime_friend"].includes(format.id)) return 0.75;
  if (format.preferredProductRoles[0] === "natural_use") return 2.5;
  if (format.preferredProductRoles[0] === "hidden") return 2;
  return 1;
}

function getNoveltyPenalty(format: OmniLifeFormat, recent: readonly LifeFormatId[]) {
  let penalty = 0;
  recent.slice(0, 4).forEach((recentId, index) => {
    const recencyWeight = [2, 1.25, 0.75, 0.5][index];
    if (recentId === format.id) penalty += recencyWeight;
    else if (format.adjacentFormats.includes(recentId)) penalty += recencyWeight * 0.6;
  });
  return Math.min(2.5, round(penalty));
}

function selectProductRole(format: OmniLifeFormat, content: string, hasReference: boolean): ProductRole {
  if (!hasReference || INTANGIBLE_PRODUCT_PATTERN.test(content)) return "hidden";
  if (EXPLICIT_DEMO_PATTERN.test(content) && format.allowedProductRoles.includes("brief_demo")) return "brief_demo";
  return format.preferredProductRoles[0] || format.allowedProductRoles[0];
}

function selectHookType(format: OmniLifeFormat, firstLine: string, productRole: ProductRole): HookType {
  const preferred: HookType[] = REPLACEMENT_PATTERN.test(firstLine)
    ? ["contrast", "problem_in_action"]
    : PROBLEM_PATTERN.test(firstLine)
      ? ["problem_in_action", "contrast"]
      : RESULT_PATTERN.test(firstLine)
        ? ["result_first", "micro_demonstration"]
        : SURPRISE_PATTERN.test(firstLine)
          ? ["broken_expectation", "unexpected_object"]
          : [];
  const compatible = format.compatibleHooks.filter(
    (hook) => productRole !== "hidden" || !["unexpected_object", "micro_demonstration"].includes(hook)
  );
  const semanticMatch = preferred.find((hook) => compatible.includes(hook));
  return semanticMatch || pickStable(compatible.length ? compatible : format.compatibleHooks, `${firstLine}|${format.id}`);
}

function buildHookRule(hookType: HookType) {
  const rules: Record<HookType, string> = {
    problem_in_action: "В первом кадре неудобство из первых слов уже физически происходит; герой не объясняет его заранее.",
    result_first: "Первый кадр сразу показывает итоговое состояние из первых слов, а затем герой объясняет причину.",
    unexpected_object: "Первый кадр начинается с одного неожиданного, но прямо связанного с репликой предмета.",
    contrast: "Первое движение показывает старое состояние, второе — явную смену, названную в реплике.",
    broken_expectation: "Ожидаемое бытовое действие прерывается в первом кадре ровно по смыслу первых слов.",
    micro_demonstration: "В первом кадре герой выполняет одно безопасное движение руками, которое доказывает первые слова.",
  };
  return rules[hookType];
}

function buildProductActionRule(role: ProductRole) {
  if (role === "hidden") return "Продукт не появляется в кадре; любопытство создают история и результат.";
  if (role === "brief_demo") return "Коротко показать продукт один раз по смыслу реплики, без рекламного крупного плана.";
  if (role === "background_prop") return "Продукт может естественно лежать в сцене, но герой не позирует с ним и не выделяет логотип.";
  return "После последнего слова продукт можно один раз взять или убрать; не пытаться есть, пить или наносить его в этом сегменте.";
}

function buildSelectionReason(selected: ScoredFormat) {
  const { semanticFit, productNaturalness, audienceSettingFit, actionFeasibility, noveltyPenalty } = selected.score;
  return `semantic=${semanticFit}; product=${productNaturalness}; audience=${audienceSettingFit}; feasibility=${actionFeasibility}; novelty=-${noveltyPenalty}`;
}

function compareScores(left: ScoredFormat, right: ScoredFormat) {
  return right.score.total - left.score.total || right.score.semanticFit - left.score.semanticFit ||
    right.format.retentionPriority - left.format.retentionPriority || left.format.id.localeCompare(right.format.id);
}

function countPhraseHits(text: string, phrases: readonly string[]) {
  return phrases.reduce((count, phrase) => count + (text.includes(normalize(phrase)) ? 1 : 0), 0);
}

function pickStable<T>(items: readonly T[], seed: string): T {
  if (!items.length) throw new Error("Cannot select from an empty collection");
  return items[stableHash(seed) % items.length];
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function normalizeOptional(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
