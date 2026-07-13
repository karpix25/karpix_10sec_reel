import type { CtaMode, OmniCreativeStrategy } from "../../omni/creative-contract";

type CtaSignals = {
  asksForComment: boolean;
  mentionsProfileLink: boolean;
  mentionsArticle: boolean;
};

export function ensureOmniScriptCta(script: string, mode: CtaMode, value?: string | null) {
  const normalizedValue = value?.trim() || null;
  const signals = analyzeCta(script);
  assertNoConflictingCta(signals, mode);

  if (mode === "keyword_in_comments") {
    if (!normalizedValue) throw new Error("Для CTA в комментариях не настроено кодовое слово.");
    if (signals.asksForComment && normalize(script).includes(normalize(normalizedValue))) return script;
    if (signals.asksForComment) throw new Error("В сценарии указано другое кодовое слово для комментариев.");
    return appendSentence(script, `Напишите кодовое слово «${normalizedValue}» в комментариях.`);
  }
  if (mode === "link_in_profile" && !signals.mentionsProfileLink) {
    return appendSentence(script, "Подробности можно найти по ссылке в профиле.");
  }
  if (mode === "article_in_description" && !signals.mentionsArticle) {
    return appendSentence(script, "Артикул можно найти в описании.");
  }
  return script;
}

export function assertOmniCtaContract(script: string, strategy: OmniCreativeStrategy) {
  const signals = analyzeCta(script);
  assertNoConflictingCta(signals, strategy.ctaMode);
  const normalized = normalize(script);

  if (strategy.ctaMode === "keyword_in_comments" && strategy.ctaValue && signals.asksForComment &&
      !normalized.includes(normalize(strategy.ctaValue))) {
    throw new Error("В сценарии указано другое кодовое слово для комментариев.");
  }
  if (strategy.ctaMode === "keyword_in_comments" &&
      (!signals.asksForComment || !strategy.ctaValue || !normalized.includes(normalize(strategy.ctaValue)))) {
    throw new Error("В сценарии нет обязательного CTA с кодовым словом в комментариях.");
  }
  if (strategy.ctaMode === "link_in_profile" && !signals.mentionsProfileLink) {
    throw new Error("В сценарии нет обязательного CTA со ссылкой в профиле.");
  }
  if (strategy.ctaMode === "article_in_description" && !signals.mentionsArticle) {
    throw new Error("В сценарии нет обязательного CTA с артикулом в описании.");
  }
}

function analyzeCta(script: string): CtaSignals {
  const normalized = normalize(script);
  return {
    asksForComment: /напиш|коммент|кодово.*слов/iu.test(normalized),
    mentionsProfileLink: /ссылк.*(?:профил|био)/iu.test(normalized),
    mentionsArticle: /артикул|арт\.?\s|описани/iu.test(normalized),
  };
}

function assertNoConflictingCta(signals: CtaSignals, mode: CtaMode) {
  if (mode === "keyword_in_comments" && (signals.mentionsProfileLink || signals.mentionsArticle)) {
    throw new Error("CTA сценария конфликтует с режимом «кодовое слово в комментариях».");
  }
  if (mode === "link_in_profile" && (signals.asksForComment || signals.mentionsArticle)) {
    throw new Error("CTA сценария конфликтует с режимом «ссылка в профиле».");
  }
  if (mode === "article_in_description" && (signals.asksForComment || signals.mentionsProfileLink)) {
    throw new Error("CTA сценария конфликтует с режимом «артикул в описании».");
  }
  if (mode === "no_explicit_cta" &&
      (signals.asksForComment || signals.mentionsProfileLink || signals.mentionsArticle)) {
    throw new Error("В сценарии есть явный CTA, хотя для продукта CTA отключён.");
  }
}

function appendSentence(script: string, sentence: string) {
  return `${script.trim()} ${sentence}`.trim();
}

function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}
