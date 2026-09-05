import type { OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { formatScenarioScript } from "@/lib/scenario-text";
import type { PromptChainInput } from "./llm-prompt-chain-prompts";
import type { CreativeScriptAttemptDiagnostic, CreativeScriptDraft, ScriptSemanticReview } from "./llm-prompt-chain-types";
import { normalizeCreativeScriptDraft } from "./llm-prompt-chain-normalizer";
import { buildCreativeCopywriterAttemptPrompt } from "./llm-prompt-chain-creative-repair";
import { spellPromptChainNumbersInText } from "./llm-prompt-chain-number-words";
import { sanitizeOmniScriptText } from "./omni-script-text-contract";
import { normalizeRussianSpeechGender } from "./russian-speech-gender-contract";
import { collectCreativeScriptPreflight, type CreativeScriptPreflight, type CreativeScriptQualityContext } from "./creative-script-preflight";
import { assertScriptSemanticReviewPassed, reviewScriptSemantics } from "./script-semantic-reviewer";

const CREATIVE_COPYWRITER_ATTEMPTS = 2;
type CreativeRequest = (request: { attempt: number; userPrompt: string; temperature: number }) => Promise<string>;

export class CreativeCopywriterFailure extends Error {
  constructor(message: string, readonly partialSnapshot: {
    creativeScriptDraft?: CreativeScriptDraft;
    semanticReview?: ScriptSemanticReview;
    creativeAttemptDiagnostics: CreativeScriptAttemptDiagnostic[];
  }) { super(message); this.name = "CreativeCopywriterFailure"; }
}

export async function runCreativeCopywriter(
  input: PromptChainInput & { model: string },
  onUsage: (usage: OpenRouterUsageRecord) => void,
  request: CreativeRequest,
) {
  let previousDraft: CreativeScriptDraft | null = null;
  let lastSemanticReview: ScriptSemanticReview | null = null;
  let preflight: CreativeScriptPreflight | null = null;
  let lastError = "";
  const diagnostics: CreativeScriptAttemptDiagnostic[] = [];
  for (let attempt = 1; attempt <= CREATIVE_COPYWRITER_ATTEMPTS; attempt += 1) {
    const diagnostic: CreativeScriptAttemptDiagnostic = {
      attempt, sentenceWordCounts: [], segmentWordCounts: null,
      localIssues: [], semanticPassed: null, semanticIssues: [], failure: null,
    };
    diagnostics.push(diagnostic);
    try {
      const creativeAttempt = buildCreativeCopywriterAttemptPrompt({
        chainInput: input, attempt, maxAttempts: CREATIVE_COPYWRITER_ATTEMPTS,
        previousDraft, semanticReview: lastSemanticReview, failureReason: lastError, preflight,
      });
      const content = await request({
        attempt, userPrompt: creativeAttempt.prompt,
        temperature: creativeAttempt.mode === "targeted_repair" ? 0.25 : 0.8,
      });
      const draft = normalizeCreativeScriptDraft(content);
      if (!draft) throw new Error("Creative copywriter returned empty script");
      const script = normalizeRussianSpeechGender(
        sanitizeOmniScriptText(spellPromptChainNumbersInText(formatScenarioScript(draft.script))), input.avatarSpeechGender,
      );
      // Keep the candidate intact: removing whole sentences to meet a word count can erase its bridge or facts.
      previousDraft = { ...draft, script };
      lastSemanticReview = null;
      const evaluation = await evaluateCreativeScriptDraft(input, script, onUsage, attempt);
      preflight = evaluation.preflight;
      lastSemanticReview = evaluation.semanticReview;
      diagnostic.localIssues = preflight.issues;
      diagnostic.sentenceWordCounts = preflight.sentences.map((sentence) => sentence.wordCount);
      diagnostic.segmentWordCounts = preflight.segmentPlan?.segmentWordCounts || null;
      diagnostic.semanticPassed = lastSemanticReview?.passed ?? null;
      diagnostic.semanticIssues = lastSemanticReview?.issues || [];
      if (evaluation.issues.length) throw new Error(evaluation.issues.join("\n"));
      if (!lastSemanticReview || !preflight.segmentPlan) throw new Error("Creative draft did not pass all checks");
      return { draft: previousDraft, semanticReview: lastSemanticReview, diagnostics };
    } catch (error) {
      lastError = errorMessage(error);
      diagnostic.failure = lastError;
    }
  }
  throw new CreativeCopywriterFailure(`Creative copywriter failed: ${lastError}`, {
    ...(previousDraft ? { creativeScriptDraft: previousDraft } : {}),
    ...(lastSemanticReview ? { semanticReview: lastSemanticReview } : {}),
    creativeAttemptDiagnostics: diagnostics,
  });
}

export async function evaluateCreativeScriptDraft(
  input: PromptChainInput & { model: string }, script: string,
  onUsage: (usage: OpenRouterUsageRecord) => void, attempt: number, qualityContext: CreativeScriptQualityContext = {},
) {
  const preflight = collectCreativeScriptPreflight(input, script, qualityContext);
  const issues = [...preflight.issues];
  let semanticReview: ScriptSemanticReview | null = null;
  // Same two-review ceiling; timing errors no longer hide semantic issues from the one repair attempt.
  try {
    semanticReview = await reviewScriptSemantics({
      model: input.model, script, referenceScript: input.sourceScenario.script,
      productName: input.productName, productDescription: input.productDescription,
      productReferenceNotes: input.productReferenceNotes, ctaMode: input.ctaMode, ctaValue: input.ctaValue,
      directorBrief: input.directorBrief, adaptationPlan: input.adaptationPlan, contentContract: input.contentContract,
    }, onUsage, attempt);
    assertScriptSemanticReviewPassed(semanticReview);
  } catch (error) { issues.push(errorMessage(error)); }
  return { preflight, semanticReview, issues: [...new Set(issues)] };
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
