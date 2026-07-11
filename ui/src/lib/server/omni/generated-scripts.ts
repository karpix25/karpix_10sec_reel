import pool from "@/lib/db";
import type { OmniGeneratedScript, OmniLegacyScenario } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { getRandomLegacyScenarioFromClients } from "./legacy-scenarios";
import { listLegacyLibraryLinks } from "./legacy-library-links";
import { requireOmniProductInProject } from "./products";
import { getOmniProject } from "./projects";

type GeneratedScriptPayload = {
  title?: string;
  hook?: string;
  script?: string;
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
  const script = String(parsed.script || "").trim();
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
  sourceScenario: OmniLegacyScenario;
}) {
  return `
Создай 1 новый сценарий для Instagram Reels по методологии reels-script-writer.

Правила:
1. Используй исходную транскрибацию референс-видео как паттерн формата: хук, структура удержания, ритм, порядок смысловых битов и подачу.
2. Новый сценарий должен продвигать выбранный продукт.
3. Формат: говорящая голова.
4. Структура: кульминационный хук 0-3 сек, 2-3 плотных бита, один CTA.
5. CTA: "Пиши кодовое слово [СЛОВО] в комментариях, и я пришлю тебе [ПОДАРОК]".
6. Не используй дешевый кликбейт: "СТОП", "не листай", "99% людей", "секрет, который скрывают", "досмотри до конца".
7. Не используй длинное тире, слова "является", "в современном мире", "стоит отметить", "важно понимать".
8. Не добавляй emoji.
9. Пиши бытовым русским языком. Одна мысль в одной строке.

Клиент: ${input.projectName}
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
  "script": "полный сценарий с пометками этапов и визуальными подсказками",
  "caption": "описание поста",
  "cta_keyword": "кодовое слово капсом",
  "lead_magnet": "что человек получает в личку"
}
`;
}
