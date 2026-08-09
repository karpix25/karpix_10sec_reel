import pool from "@/lib/db";
import type { CtaMode } from "@/lib/omni/creative-contract";
import type { OmniGeneratedScript } from "@/lib/omni/types";
import { type OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import { ensureOmniScriptCta } from "./omni-cta-contract";
import { planOmniReelSegments } from "./omni-duration-planner";
import type { OmniDurationRange } from "./omni-duration-range";
import { parseAndRepairJson } from "./script-json-repair";
import { validateViralScriptContract } from "./script-quality-contract";
import { assertOmniScriptTextContract, sanitizeOmniScriptText } from "./omni-script-text-contract";
import { assertRussianSpeechGender } from "./russian-speech-gender-contract";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function compactOmniGeneratedScript(input: {
  generatedScript: OmniGeneratedScript;
  productName: string;
  ctaMode: CtaMode;
  ctaValue: string | null;
  avatarSpeechGender: OmniAvatarSpeechGender;
  durationRange: OmniDurationRange;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("Production preflight blocked: OPENROUTER_API_KEY is not configured for script compaction");

  const model = input.generatedScript.model || process.env.SCENARIO_MODEL || "google/gemini-2.5-flash";
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels script compaction",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Сожми существующий сценарий Reels, не создавай новый сценарий. Верни только JSON.",
        },
        {
          role: "user",
          content: buildCompactionPrompt(input),
        },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Production preflight blocked: script compaction failed (${response.status} ${text.slice(0, 240)})`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const content = readAssistantContent(data);
  const parsed = parseAndRepairJson(content);
  const compacted = ensureOmniScriptCta(
    sanitizeOmniScriptText(typeof parsed.script === "string" ? parsed.script : ""),
    input.ctaMode,
    input.ctaValue
  );
  if (!compacted) throw new Error("Production preflight blocked: script compaction returned empty text");

  assertOmniScriptTextContract(compacted);
  assertRussianSpeechGender(compacted, input.avatarSpeechGender);
  const quality = validateViralScriptContract({
    script: compacted,
    rawScriptBeforeCta: compacted,
    rawScriptFromModel: compacted,
    hook: input.generatedScript.hook,
    productName: input.productName,
    ctaMode: input.ctaMode,
    ctaValue: input.ctaValue,
    durationRange: input.durationRange,
    referenceScript: input.generatedScript.script,
  });
  if (!quality.passed) {
    throw new Error("Production preflight blocked: compacted script did not pass script quality checks");
  }
  const plan = planOmniReelSegments(compacted, { durationRange: input.durationRange });
  const sourceSnapshot = asRecord(input.generatedScript.source_snapshot) || {};
  const updatedSnapshot = {
    ...sourceSnapshot,
    generated_script_plan: null,
    generatedScriptPlan: null,
    script_plan: null,
    scriptPlan: null,
    llm_prompt_chain: null,
    prompt_chain: null,
    provider_prompt_plan: null,
    director_segment_plan: null,
    compaction: {
      source_script_id: input.generatedScript.id,
      original_script: input.generatedScript.script,
      source_word_count: countWords(input.generatedScript.script),
      compacted_word_count: plan.wordCount,
      target_word_range: [input.durationRange.minWords, input.durationRange.maxWords],
      model,
      updated_at: new Date().toISOString(),
      quality_check: quality,
    },
  };

  await pool.query(
    `UPDATE omni_generated_scripts
     SET script = $2,
         source_snapshot = $3::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [input.generatedScript.id, compacted, JSON.stringify(updatedSnapshot)]
  );
  return { scriptId: input.generatedScript.id, wordCount: plan.wordCount, segmentCount: plan.segmentCount };
}

function buildCompactionPrompt(input: Parameters<typeof compactOmniGeneratedScript>[0]) {
  return [
    `Продукт: ${input.productName}`,
    `CTA: ${input.ctaMode}${input.ctaValue ? `, ${input.ctaValue}` : ""}`,
    `Целевой диапазон: ${input.durationRange.minWords}-${input.durationRange.maxWords} слов. Максимум не превышать.`,
    "Сохрани первый хук максимально близко к исходному.",
    "Сохрани порядок мыслей, главный тезис, механизм, конкретный пример или доказательство и CTA.",
    "Удали повторы, вводные слова и лишние пояснения. Не добавляй новые факты, обещания, аргументы или новую тему.",
    "Верни одну связную разговорную реплику для voiceover в поле script.",
    JSON.stringify({ hook: input.generatedScript.hook || "", script: input.generatedScript.script }),
    'Формат: {"script":"..."}',
  ].join("\n");
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const message = choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0])
    ? (choices[0] as Record<string, unknown>).message
    : null;
  const content = message && typeof message === "object" && !Array.isArray(message)
    ? (message as Record<string, unknown>).content
    : null;
  return typeof content === "string" ? content : "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
