import pool from "@/lib/db";
import type { OmniGeneratedScript, OmniLegacyScenario, OmniPromptPreviewSegment } from "@/lib/omni/types";
import { formatScenarioScript } from "@/lib/scenario-text";
import { ensureOmniSchema } from "./schema";
import { getLatestOmniClientAvatar } from "./avatars";
import { getRandomLegacyScenarioFromClients } from "./legacy-scenarios";
import { listLegacyLibraryLinks } from "./legacy-library-links";
import { buildOmniSegmentPrompts } from "./omni-prompt-builder";
import { requireOmniProductInProject } from "./products";
import { getOmniProject } from "./projects";
import { listRecentLifeFormatIds } from "./omni-creative-history";
import type { CtaMode } from "@/lib/omni/creative-contract";

type GeneratedScriptPayload = {
  title?: string;
  hook?: string;
  script?: unknown;
  caption?: string;
  cta_keyword?: string;
  lead_magnet?: string;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function normalizeScript(row: OmniGeneratedScript): OmniGeneratedScript {
  return {
    ...row,
    source_legacy_scenario_id:
      row.source_legacy_scenario_id === null ? null : Number(row.source_legacy_scenario_id),
    source_legacy_client_id:
      row.source_legacy_client_id === null ? null : Number(row.source_legacy_client_id),
  };
}

export async function listGeneratedScripts(projectId: number, productId?: number | null) {
  await ensureOmniSchema();
  const values: unknown[] = [projectId];
  const clauses = ["project_id = $1"];

  if (productId) {
    values.push(productId);
    clauses.push(`product_id = $${values.length}`);
  }

  const { rows } = await pool.query<OmniGeneratedScript>(
    `SELECT *
     FROM omni_generated_scripts
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values
  );
  return rows.map(normalizeScript);
}

export async function getGeneratedScript(input: { projectId: number; productId: number; scriptId: number }) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniGeneratedScript>(
    `SELECT *
     FROM omni_generated_scripts
     WHERE id = $1
       AND project_id = $2
       AND product_id = $3
       AND status <> 'archived'
     LIMIT 1`,
    [input.scriptId, input.projectId, input.productId]
  );
  return rows[0] ? normalizeScript(rows[0]) : null;
}

export async function buildGeneratedScriptPromptPreview(input: {
  projectId: number;
  productId: number;
  scriptId: number;
}): Promise<OmniPromptPreviewSegment[]> {
  const generatedScript = await getGeneratedScript(input);
  if (!generatedScript) throw new Error("Generated script not found for this product");

  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const avatar = await getLatestOmniClientAvatar(input.projectId);
  const project = await getOmniProject(input.projectId);
  if (!project) throw new Error("Omni client project not found");
  const segmentCount = Math.ceil(product.target_duration_seconds / 10);
  const recentFormatIds = await listRecentLifeFormatIds(input.projectId, input.productId);

  return buildOmniSegmentPrompts({
    generatedScript,
    legacyTranscript: null,
    product,
    avatar,
    segmentCount,
    segmentSeconds: 10,
    brief: null,
    targetAudience: project.target_audience,
    ctaMode: product.cta_mode,
    ctaValue: product.cta_value,
    recentFormatIds,
  }).map((segment) => ({
    segmentIndex: segment.index,
    durationSeconds: 10,
    role: segment.role,
    prompt: segment.prompt,
    referenceUrl: segment.referenceUrl,
    voiceoverText: segment.voiceoverText,
    creativeStrategy: segment.creativeStrategy,
    creativePlan: segment.creativePlan,
    validation: segment.validation,
  }));
}

export async function createGeneratedScriptFromLegacy(input: {
  projectId: number;
  productId: number;
}) {
  await ensureOmniSchema();
  const project = await getOmniProject(input.projectId);
  if (!project) throw new Error("Omni client project not found");

  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const libraryLinks = await listLegacyLibraryLinks(input.projectId, null);
  const legacyClientIds = libraryLinks.map((link) => link.legacy_client_id);
  if (!legacyClientIds.length) {
    throw new Error("No active legacy bundles for this project");
  }

  const sourceScenario = await getRandomLegacyScenarioFromClients(legacyClientIds);
  if (!sourceScenario) {
    throw new Error("No reference transcripts found in active legacy bundles");
  }

  const model = process.env.SCENARIO_MODEL || "google/gemini-2.5-flash";
  const generated = await generateScript({
    model,
    projectName: project.name,
    targetAudience: project.target_audience,
    brandVoice: project.brand_voice,
    productName: product.name,
    productDescription: product.description,
    productReferenceNotes: product.product_reference_notes,
    ctaMode: product.cta_mode,
    ctaValue: product.cta_value,
    sourceScenario,
  });

  const sourceSnapshot = {
    id: sourceScenario.id,
    legacy_client_id: sourceScenario.client_id,
    legacy_client_name: sourceScenario.legacy_client_name,
    legacy_product_keyword: sourceScenario.legacy_product_keyword,
    title: sourceScenario.title,
    topic: sourceScenario.topic,
    source_kind: "legacy_reference_transcript",
    transcript: sourceScenario.script,
    reels_url: sourceScenario.reels_url,
    word_count: sourceScenario.word_count,
    duration_seconds: sourceScenario.duration_seconds,
    source_reference: sourceScenario.source_reference,
  };
  const productSnapshot = {
    id: product.id,
    name: product.name,
    description: product.description,
    product_reference_notes: product.product_reference_notes,
    product_refs: product.product_refs,
  };

  const { rows } = await pool.query<OmniGeneratedScript>(
    `INSERT INTO omni_generated_scripts (
       project_id,
       product_id,
       source_legacy_scenario_id,
       source_legacy_client_id,
       title,
       hook,
       script,
       caption,
       cta_keyword,
       lead_magnet,
       source_snapshot,
       product_snapshot,
       model,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      input.projectId,
      input.productId,
      sourceScenario.id,
      sourceScenario.client_id,
      generated.title || null,
      generated.hook || null,
      generated.script || "",
      generated.caption || null,
      generated.cta_keyword || null,
      generated.lead_magnet || null,
      JSON.stringify(sourceSnapshot),
      JSON.stringify(productSnapshot),
      model,
    ]
  );

  return normalizeScript(rows[0]);
}

async function generateScript(input: {
  model: string;
  projectName: string;
  targetAudience: string | null;
  brandVoice: string | null;
  productName: string;
  productDescription: string | null;
  productReferenceNotes: string | null;
  ctaMode: CtaMode;
  ctaValue: string | null;
  sourceScenario: OmniLegacyScenario;
}): Promise<Required<GeneratedScriptPayload>> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "Ты сценарист Instagram Reels. Пиши на русском, живо и просто. Верни только валидный JSON без markdown.",
        },
        {
          role: "user",
          content: buildPrompt(input),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Script model request failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = await response.json();
  const content = String(data?.choices?.[0]?.message?.content || "");
  const parsed = parseJsonPayload(content);
  const script = formatScenarioScript(parsed.script);
  if (!script) throw new Error("Script model returned empty script");

  return {
    title: String(parsed.title || parsed.hook || "Новый сценарий").trim(),
    hook: String(parsed.hook || "").trim(),
    script,
    caption: String(parsed.caption || "").trim(),
    cta_keyword: String(parsed.cta_keyword || "").trim(),
    lead_magnet: String(parsed.lead_magnet || "").trim(),
  };
}

function parseJsonPayload(content: string): GeneratedScriptPayload {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as GeneratedScriptPayload;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as GeneratedScriptPayload;
    }
    throw new Error("Script model returned invalid JSON");
  }
}

function buildPrompt(input: {
  projectName: string;
  targetAudience: string | null;
  brandVoice: string | null;
  productName: string;
  productDescription: string | null;
  productReferenceNotes: string | null;
  ctaMode: CtaMode;
  ctaValue: string | null;
  sourceScenario: OmniLegacyScenario;
}) {
  return `
Создай 1 новый сценарий для Instagram Reels по методологии reels-script-writer.

Правила:
1. Используй исходную транскрибацию референс-видео как паттерн формата: хук, структура удержания, ритм, порядок смысловых битов и подачу.
2. Новый сценарий должен продвигать выбранный продукт.
3. Формат: говорящая голова.
4. Структура: кульминационный хук 0-3 сек, 2-3 плотных бита, один CTA.
5. CTA: ${buildCtaInstruction(input.ctaMode, input.ctaValue)}
6. Не добавляй второй CTA и не меняй выбранное действие. Если для CTA нужны конкретные данные и их нет, не выдумывай их.
7. Не используй дешевый кликбейт: "СТОП", "не листай", "99% людей", "секрет, который скрывают", "досмотри до конца".
8. Не используй длинное тире, слова "является", "в современном мире", "стоит отметить", "важно понимать".
9. Не добавляй emoji.
10. Пиши бытовым русским языком. Одна мысль в одной строке.

Бренд: ${input.projectName}
Целевая аудитория: ${input.targetAudience || "не указана"}
Tone of voice: ${input.brandVoice || "не указан"}

Продукт: ${input.productName}
Описание продукта: ${input.productDescription || "не указано"}
Заметки по продукту: ${input.productReferenceNotes || "не указаны"}

Оригинальная транскрибация reference-видео:
${input.sourceScenario.script}

Верни JSON строго такого вида:
{
  "title": "короткий заголовок сценария",
  "hook": "кульминационный хук",
  "script": "полный сценарий одной строкой или многострочным текстом; не массив и не объект",
  "caption": "описание поста в соответствии с выбранным CTA; без выдуманных номеров и ссылок",
  "cta_keyword": "кодовое слово только для CTA через комментарии; иначе пустая строка",
  "lead_magnet": "пустая строка, если отдельного подарка нет"
}
`;
}

function buildCtaInstruction(mode: CtaMode, value: string | null) {
  if (mode === "keyword_in_comments") {
    return `в финале естественно попроси написать кодовое слово «${value}» в комментариях; произнеси его точно`;
  }
  if (mode === "link_in_profile") {
    return `в финале мягко направь к ссылке в профиле${value ? `; назначение ссылки: ${value}` : ""}`;
  }
  if (mode === "no_explicit_cta") return "не добавляй явный призыв; закончи личным выводом";
  return "в финале мягко скажи, что артикул или код можно найти в описании; если номера нет в данных, не выдумывай его";
}
