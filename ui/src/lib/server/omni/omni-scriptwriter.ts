import pool from "@/lib/db";
import { ensureOmniSchema } from "./schema";
import { listProductReferenceMaterials, type OmniProductReferenceLibraryItem } from "./omni-reference-materials";
import {
  collectScriptwriterFrames,
  findScriptwriterFrame,
  pickDefaultScriptwriterFrame,
  type ScriptwriterFrame,
} from "./omni-scriptwriter-frames";
import { sanitizeOmniScriptText, assertOmniScriptTextContract } from "./omni-script-text-contract";
import { ensureOmniScriptCta, assertOmniCtaContract } from "./omni-cta-contract";
import { validateScriptFactGrounding } from "./omni-script-fact-validator";
import { spellPromptChainNumbersInText } from "./llm-prompt-chain-number-words";
import type { CtaMode } from "../../omni/creative-contract";

/**
 * The scriptwriter role: writes a script for a topic using the product card
 * and the accumulated reference materials (form only). References never
 * carry product placement into the script — organic integration comes from
 * the product's own card.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SCRIPTWRITER_REQUEST_TIMEOUT_MS = 120_000;
// The fact gate makes drafts strictly verified; give the model one extra
// repair pass so grounding rejections convert into compliant scripts.
const SCRIPTWRITER_ATTEMPTS = 3;
const WORDS_PER_SECOND_BUDGET = 2.2;
const WORD_BUDGET_TOLERANCE = 0.25;

type ScriptwriterProductCard = {
  name: string;
  description: string | null;
  product_reference_notes: string | null;
  visual_summary: string | null;
  physical_contract: string | null;
  target_duration_seconds: number;
  cta_mode: CtaMode;
  cta_value: string | null;
};

type ScriptwriterMaterialForm = {
  material_id: number;
  format_mode: string | null;
  hook_mechanism: string | null;
  visual_hook_action: string | null;
  retention_trigger: string | null;
  narrative_structure: string[];
  reusable_visual_mechanics: string[];
  content_facts: string[];
};

export type ScriptwriterRequest = (input: {
  attempt: number;
  userPrompt: string;
  temperature: number;
}) => Promise<string>;

export class ScriptwriterFailure extends Error {
  constructor(message: string, readonly partialSnapshot: { lastDraft: string; lastError: string }) {
    super(message);
    this.name = "ScriptwriterFailure";
  }
}

export const SCRIPTWRITER_FALLBACK_FRAME: ScriptwriterFrame = {
  id: "hook-problem-solution",
  title: "Крючок — Проблема — Решение — Призыв",
  description: "Классика прямого отклика: цепляющая первая секунда, узнаваемая боль, продукт как решение, призыв.",
  structure: ["Крючок", "Проблема", "Решение (продукт)", "Доказательство", "Призыв"],
  source: "builtin",
};

export function computeScriptwriterWordBudget(targetDurationSeconds: number) {
  const duration = Number.isFinite(targetDurationSeconds) && targetDuration_seconds_safe(targetDurationSeconds)
    ? targetDurationSeconds
    : 20;
  return Math.round(duration * WORDS_PER_SECOND_BUDGET);
}

function targetDuration_seconds_safe(value: number) {
  return value > 0 && value <= 120;
}

export function extractMaterialForm(material: OmniProductReferenceLibraryItem): ScriptwriterMaterialForm {
  const materialJson = material.material_json as
    | {
        reusable_mechanics?: { visual_mechanics?: unknown };
        key_arguments?: unknown;
        proof_or_examples?: unknown;
        conclusion?: unknown;
      }
    | null;
  const stringList = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  return {
    material_id: material.material_id,
    format_mode: material.format_mode,
    hook_mechanism: material.hook_mechanism,
    visual_hook_action: material.visual_hook_action,
    retention_trigger: material.retention_trigger,
    narrative_structure: material.narrative_structure,
    reusable_visual_mechanics: stringList(materialJson?.reusable_mechanics?.visual_mechanics),
    // Content substance (destination, prices, details) — the script needs it for
    // concreteness; product facts still come only from the product card.
    content_facts: [
      ...stringList(materialJson?.key_arguments),
      ...stringList(materialJson?.proof_or_examples),
      ...(typeof materialJson?.conclusion === "string" && materialJson.conclusion.trim()
        ? [materialJson.conclusion.trim()]
        : []),
    ].slice(0, 8),
  };
}

function ctaRequirementLine(product: ScriptwriterProductCard) {
  switch (product.cta_mode) {
    case "no_explicit_cta":
      return "- Финального призыва к действию не добавляй.";
    case "link_in_profile":
      // An audience question in the finale reads as a comment CTA and fails the contract.
      return "- НЕ задавай аудитории финальный вопрос и НЕ проси писать в комментарии. Заверши фразой про ссылку в профиле, например: «Все подробности по ссылке в профиле».";
    case "keyword_in_comments":
      return `- Заверши призывом написать кодовое слово${product.cta_value ? ` «${product.cta_value}»` : ""} в комментариях.`;
    case "article_in_description":
      return "- Заверши нативным упоминанием артикула продукта в описании.";
    default:
      return `- Заверши призывом к действию (${product.cta_mode}).`;
  }
}

export function buildScriptwriterPrompt(input: {
  topic: string;
  frame: ScriptwriterFrame;
  product: ScriptwriterProductCard;
  materials: ScriptwriterMaterialForm[];
  wordBudget: number;
}) {
  const lines: (string | null)[] = [
    "Ты — сценарист коротких вертикальных роликов (Reels) на русском языке.",
    "",
    `ТЕМА: ${input.topic}`,
    "",
    "КАРТОЧКА ПРОДУКТА (единственный источник про продукт):",
    `- Название: ${input.product.name}`,
    input.product.description ? `- Описание: ${input.product.description}` : null,
    input.product.product_reference_notes ? `- Заметки: ${input.product.product_reference_notes}` : null,
    input.product.visual_summary ? `- Внешний вид: ${input.product.visual_summary}` : null,
    input.product.physical_contract ? `- Физические свойства: ${input.product.physical_contract}` : null,
    "",
    `ФРЕЙМ СЦЕНАРИЯ «${input.frame.title}»: ${input.frame.description}`,
    `Структура по шагам: ${input.frame.structure.join(" → ")}`,
    "",
  ];

  if (input.materials.length) {
    lines.push("ПРИМЕРЫ ФОРМЫ ИЗ РЕФЕРЕНСОВ (только приёмы подачи, НЕ содержание и НЕ продукт):");
    input.materials.slice(0, 3).forEach((material, index) => {
      lines.push(
        `Пример ${index + 1}:`,
        material.format_mode ? `- формат: ${material.format_mode}` : null,
        material.hook_mechanism ? `- механика хука: ${material.hook_mechanism}` : null,
        material.visual_hook_action ? `- визуальный ход: ${material.visual_hook_action}` : null,
        material.retention_trigger ? `- удержание: ${material.retention_trigger}` : null,
        material.narrative_structure.length ? `- структура: ${material.narrative_structure.join(" → ")}` : null,
        material.reusable_visual_mechanics.length
          ? `- повторяемые визуальные приёмы: ${material.reusable_visual_mechanics.join("; ")}`
          : null,
        ""
      );
    });

    const facts = input.materials.flatMap((material) => material.content_facts).filter(Boolean).slice(0, 10);
    if (facts.length) {
      lines.push(
        "ФАКТЫ ИЗ РЕФЕРЕНСА (единственный источник конкретики: места, суммы, детали):",
        ...facts.map((fact) => `- ${fact}`),
        "- Место и суммы бери ТОЛЬКО отсюда и дословно. Подменять место или придумывать другие суммы запрещено.",
        ""
      );
    }
  }

  lines.push(
    "ТРЕБОВАНИЯ К СЦЕНАРИЮ:",
    "- Продукт вписывается нативно и органично: он часть истории, а не рекламная вставка. Опирайся только на карточку продукта.",
    "- Обещание хука обязано быть закрыто в тексте: назвал «остров за копейки» — назови остров и суммы. Конкретику бери из блока фактов; выдумывать факты нельзя.",
    `- Общая длительность озвучки: ${input.product.target_duration_seconds} секунд, примерно ${input.wordBudget} слов (допуск 25%).`,
    "- Пиши числа словами (не цифрами). Запрещены длинные тире, эмодзи и любые символы, кроме обычного текста и короткого дефиса.",
    "- Живой разговорный русский, без канцелярита и штампов. Хук — первая фраза, которая останавливает палец.",
    ctaRequirementLine(input.product),
    "",
    "Верни только валидный JSON без markdown:",
    '{"hook": "первая фраза-хук", "script": "полный текст озвучки одним куском", "cta_keyword": "ключевое слово призыва или null"}'
  );

  return lines.filter((line) => line !== null).join("\n");
}

function parseScriptwriterDraft(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(trimmed) as { hook?: unknown; script?: unknown; cta_keyword?: unknown };
  const script = typeof parsed.script === "string" ? parsed.script.trim() : "";
  if (script.length < 40) throw new Error("Scriptwriter returned empty or too short script");
  return {
    hook: typeof parsed.hook === "string" && parsed.hook.trim()
      ? parsed.hook.trim()
      : script.split(/(?<=[.!?])\s/)[0] || script.slice(0, 120),
    script,
    ctaKeyword: typeof parsed.cta_keyword === "string" && parsed.cta_keyword.trim() ? parsed.cta_keyword.trim() : null,
  };
}

function normalizeDraftText(value: string) {
  return sanitizeOmniScriptText(spellPromptChainNumbersInText(value));
}

function validateScriptwriterDraft(input: {
  script: string;
  hook: string;
  wordBudget: number;
  product: ScriptwriterProductCard;
  facts: string[];
}) {
  const issues: string[] = [];
  try {
    assertOmniScriptTextContract(input.script);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  const wordCount = input.script.split(/\s+/).filter(Boolean).length;
  const deviation = Math.abs(wordCount - input.wordBudget) / input.wordBudget;
  if (deviation > WORD_BUDGET_TOLERANCE) {
    issues.push(`Word budget miss: ${wordCount} words vs target ${input.wordBudget} (±25%)`);
  }

  issues.push(...validateScriptFactGrounding({
    script: input.script,
    hook: input.hook,
    facts: input.facts,
    productCardText: [
      input.product.name,
      input.product.description,
      input.product.product_reference_notes,
      input.product.visual_summary,
      input.product.physical_contract,
      input.product.cta_value,
    ].filter(Boolean).join(" "),
  }));

  const withCta = ensureOmniScriptCta(input.script, input.product.cta_mode, input.product.cta_value);
  try {
    assertOmniCtaContract(withCta, { ctaMode: input.product.cta_mode, ctaValue: input.product.cta_value });
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  return { issues, script: withCta };
}

export async function composeScriptwriterDraft(input: {
  topic: string;
  frame: ScriptwriterFrame;
  product: ScriptwriterProductCard;
  materials: ScriptwriterMaterialForm[];
  request: ScriptwriterRequest;
}) {
  const wordBudget = computeScriptwriterWordBudget(input.product.target_duration_seconds);
  const basePrompt = buildScriptwriterPrompt({ ...input, wordBudget });

  let lastError = "";
  let lastDraft = "";
  for (let attempt = 1; attempt <= SCRIPTWRITER_ATTEMPTS; attempt += 1) {
    const userPrompt = lastError
      ? `${basePrompt}\n\nПовторная попытка. Исправь эти проблемы предыдущего драфта:\n${lastError}`
      : basePrompt;
    const content = await input.request({ attempt, userPrompt, temperature: attempt === 1 ? 0.8 : 0.25 });

    try {
      const draft = parseScriptwriterDraft(content);
      const script = normalizeDraftText(draft.script);
      const hook = normalizeDraftText(draft.hook);
      lastDraft = script;
      const validation = validateScriptwriterDraft({
        script,
        hook,
        wordBudget,
        product: input.product,
        facts: input.materials.flatMap((material) => material.content_facts),
      });
      if (validation.issues.length) {
        lastError = validation.issues.join("\n");
        continue;
      }
      return { hook, script: validation.script, ctaKeyword: draft.ctaKeyword, wordBudget };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new ScriptwriterFailure(`Scriptwriter failed: ${lastError}`, { lastDraft, lastError });
}

async function defaultScriptwriterRequest(input: { attempt: number; userPrompt: string; temperature: number }) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const model = process.env.SCENARIO_MODEL || "google/gemini-3.5-flash-lite";
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels",
    },
    body: JSON.stringify({
      model,
      temperature: input.temperature,
      // Reasoning models (qwen3.8) can burn the whole budget thinking and
      // return empty content; keep reasoning cheap and leave room for output.
      max_tokens: 8_000,
      reasoning: { effort: "low" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Верни только валидный JSON без markdown." },
        { role: "user", content: input.userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(SCRIPTWRITER_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Scriptwriter request failed: ${response.status} ${text.slice(0, 240)}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
    ? (firstChoice as { message?: { content?: unknown } }).message
    : null;
  const content = message && typeof message.content === "string" ? message.content : "";
  if (!content) throw new Error("Scriptwriter request returned no content");
  return content;
}

export type ScriptwriterMatrixCell = {
  signature: string;
  benefit: string;
  audience: string;
  frameId?: string;
};

export async function runOmniScriptwriter(input: {
  projectId: number;
  productId: number;
  topic: string;
  frameId?: string | null;
  materialIds?: number[];
  matrixCell?: ScriptwriterMatrixCell | null;
  request?: ScriptwriterRequest;
}) {
  await ensureOmniSchema();
  // Lazy import keeps the pure compose path testable without the heavy product-module graph.
  const { getOmniProduct } = await import("./products");
  const product = await getOmniProduct(input.productId);
  if (!product || product.project_id !== input.projectId) {
    throw new Error("Product not found in project");
  }

  const library = await listProductReferenceMaterials(input.productId, 50);
  const selectedMaterials = (
    input.materialIds?.length
      ? library.filter((item) => input.materialIds!.includes(item.material_id))
      : library.slice(0, 3)
  ).map(extractMaterialForm);

  const frames = collectScriptwriterFrames(library);
  const frame = findScriptwriterFrame(frames, input.frameId) || pickDefaultScriptwriterFrame(frames) || SCRIPTWRITER_FALLBACK_FRAME;

  const card: ScriptwriterProductCard = {
    name: product.name,
    description: product.description,
    product_reference_notes: product.product_reference_notes,
    visual_summary: product.product_visual_profile?.prompt_summary || null,
    physical_contract: product.product_physical_contract || null,
    target_duration_seconds: product.target_duration_seconds,
    cta_mode: product.cta_mode,
    cta_value: product.cta_value,
  };

  const composed = await composeScriptwriterDraft({
    topic: input.topic,
    frame,
    product: card,
    materials: selectedMaterials,
    request: input.request || defaultScriptwriterRequest,
  });

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO omni_generated_scripts (
       project_id, product_id, status, title, hook, script, cta_keyword, model, source_snapshot
     )
     VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id`,
    [
      input.projectId,
      input.productId,
      input.topic.slice(0, 120),
      composed.hook,
      composed.script,
      composed.ctaKeyword,
      process.env.SCENARIO_MODEL || "google/gemini-3.5-flash-lite",
      JSON.stringify({
        role: "scriptwriter",
        topic: input.topic,
        frame: { id: frame.id, title: frame.title, structure: frame.structure, source: frame.source },
        material_ids: selectedMaterials.map((material) => material.material_id),
        word_budget: composed.wordBudget,
        ...(input.matrixCell ? { matrix_cell: input.matrixCell } : {}),
      }),
    ]
  );

  return {
    scriptId: Number(rows[0].id),
    hook: composed.hook,
    script: composed.script,
    ctaKeyword: composed.ctaKeyword,
    frame: { id: frame.id, title: frame.title },
    wordBudget: composed.wordBudget,
  };
}
