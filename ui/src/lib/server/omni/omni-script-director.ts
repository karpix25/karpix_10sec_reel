import pool from "@/lib/db";
import { ensureOmniSchema } from "./schema";
import { listProductReferenceMaterials, type OmniProductReferenceLibraryItem } from "./omni-reference-materials";
import { extractMaterialForm } from "./omni-scriptwriter";

/**
 * The director role: turns a finished script into a storyboard-level scene
 * plan (раскадровка) using visual patterns accumulated in reference
 * materials. The plan is the LLM-driven replacement for template-only
 * prompt rendering: it decides scenes, product visibility and pacing.
 */

const DIRECTOR_ATTEMPTS = 2;

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS omni_script_director_plans (
    id SERIAL PRIMARY KEY,
    generated_script_id BIGINT NOT NULL REFERENCES omni_generated_scripts(id) ON DELETE CASCADE,
    plan_json JSONB NOT NULL,
    model TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(generated_script_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_omni_script_director_plans_script ON omni_script_director_plans(generated_script_id)",
];

let directorSchemaReady: Promise<void> | null = null;

async function ensureScriptDirectorSchema() {
  if (!directorSchemaReady) {
    directorSchemaReady = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await pool.query(statement);
      }
    })().catch((error) => {
      directorSchemaReady = null;
      throw error;
    });
  }
  return directorSchemaReady;
}

export type ScriptDirectorScene = {
  scene_index: number;
  start_sec: number;
  end_sec: number;
  purpose: string;
  visual_description: string;
  product_visible: boolean;
  product_action: string | null;
  speech_excerpt: string | null;
};

export type ScriptDirectorPlan = {
  scenes: ScriptDirectorScene[];
  atmosphere: string | null;
  camera_notes: string | null;
};

export class ScriptDirectorPlanInvalid extends Error {
  constructor(message: string) { super(message); this.name = "ScriptDirectorPlanInvalid"; }
}

export type DirectorRequest = (input: { attempt: number; userPrompt: string; temperature: number }) => Promise<string>;

export function buildScriptDirectorPrompt(input: {
  script: string;
  productSummary: string;
  targetDurationSeconds: number;
  materials: ReturnType<typeof extractMaterialForm>[];
}) {
  const lines: (string | null)[] = [
    "Ты — режиссёр коротких вертикальных роликов. Твоя задача — раскадровка готового сценария.",
    "",
    "СЦЕНАРИЙ (озвучка уже зафиксирована, не меняй текст):",
    input.script,
    "",
    "ПРОДУКТ:",
    input.productSummary,
    "",
    `ОБЩАЯ ДЛИТЕЛЬНОСТЬ: ${input.targetDurationSeconds} секунд.`,
    "",
  ];

  if (input.materials.length) {
    lines.push("ВИЗУАЛЬНЫЕ ПАТТЕРНЫ ИЗ РЕФЕРЕНСОВ (как снимают похожие ролики; не копируй содержание):");
    input.materials.slice(0, 3).forEach((material, index) => {
      lines.push(
        `Паттерн ${index + 1}:`,
        material.visual_hook_action ? `- визуальный ход: ${material.visual_hook_action}` : null,
        material.reusable_visual_mechanics.length
          ? `- приёмы: ${material.reusable_visual_mechanics.join("; ")}`
          : null,
        ""
      );
    });
  }

  lines.push(
    "ТРЕБОВАНИЯ К РАСКАДРОВКЕ:",
    "- Разбей ролик на сцены по 2-6 секунд, покрывающие всю длительность без пропусков и наложений.",
    "- Для каждой сцены: цель в драматургии, конкретное описание картинки (кто, что, как снято), виден ли продукт и что с ним делают.",
    "- Продукт показывай нативно в действии контекста сцены; не выдумывай свойства, которых нет в карточке.",
    "- speech_excerpt — короткий фрагмент озвучки этой сцены из сценария (точная цитата).",
    "",
    "Верни только валидный JSON без markdown:",
    '{"scenes": [{"scene_index": 1, "start_sec": 0, "end_sec": 4, "purpose": "...", "visual_description": "...", "product_visible": true, "product_action": "...", "speech_excerpt": "..."}], "atmosphere": "...", "camera_notes": "..."}'
  );

  return lines.filter((line) => line !== null).join("\n");
}

export function normalizeScriptDirectorPlan(raw: string, targetDurationSeconds: number): ScriptDirectorPlan {
  let parsed: { scenes?: unknown; atmosphere?: unknown; camera_notes?: unknown };
  try {
    const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    parsed = JSON.parse(trimmed);
  } catch {
    throw new ScriptDirectorPlanInvalid("Director plan is not valid JSON");
  }
  if (!Array.isArray(parsed.scenes) || !parsed.scenes.length) {
    throw new ScriptDirectorPlanInvalid("Director plan has no scenes");
  }

  const scenes: ScriptDirectorScene[] = [];
  parsed.scenes.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ScriptDirectorPlanInvalid(`Scene ${index + 1} is not an object`);
    }
    const candidate = value as Record<string, unknown>;
    const start = Number(candidate.start_sec);
    const end = Number(candidate.end_sec);
    const visual = typeof candidate.visual_description === "string" ? candidate.visual_description.trim() : "";
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new ScriptDirectorPlanInvalid(`Scene ${index + 1} has invalid time range`);
    }
    if (visual.length < 10) {
      throw new ScriptDirectorPlanInvalid(`Scene ${index + 1} has empty visual description`);
    }
    scenes.push({
      scene_index: Number.isFinite(Number(candidate.scene_index)) ? Number(candidate.scene_index) : index + 1,
      start_sec: Math.max(0, start),
      end_sec: end,
      purpose: typeof candidate.purpose === "string" ? candidate.purpose.trim() : "",
      visual_description: visual,
      product_visible: candidate.product_visible === true,
      product_action: typeof candidate.product_action === "string" && candidate.product_action.trim()
        ? candidate.product_action.trim()
        : null,
      speech_excerpt: typeof candidate.speech_excerpt === "string" && candidate.speech_excerpt.trim()
        ? candidate.speech_excerpt.trim()
        : null,
    });
  });

  scenes.sort((left, right) => left.start_sec - right.start_sec);

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (index === 0 && scene.start_sec > 0.01) {
      throw new ScriptDirectorPlanInvalid("First scene must start at 0");
    }
    if (index > 0 && scene.start_sec - scenes[index - 1].end_sec > 0.01) {
      throw new ScriptDirectorPlanInvalid(`Gap between scene ${index} and ${index + 1}`);
    }
    if (scene.end_sec > targetDurationSeconds + 1) {
      throw new ScriptDirectorPlanInvalid(`Scene ${index + 1} exceeds target duration`);
    }
  }
  const lastEnd = scenes[scenes.length - 1].end_sec;
  if (lastEnd < targetDurationSeconds - 1) {
    throw new ScriptDirectorPlanInvalid(`Scenes cover ${lastEnd}s of ${targetDurationSeconds}s`);
  }
  if (!scenes.some((scene) => scene.product_visible)) {
    throw new ScriptDirectorPlanInvalid("Product never visible across the plan");
  }

  return {
    scenes,
    atmosphere: typeof parsed.atmosphere === "string" && parsed.atmosphere.trim() ? parsed.atmosphere.trim() : null,
    camera_notes: typeof parsed.camera_notes === "string" && parsed.camera_notes.trim() ? parsed.camera_notes.trim() : null,
  };
}

async function defaultDirectorRequest(input: { attempt: number; userPrompt: string; temperature: number }) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const model = process.env.SCENARIO_MODEL || "google/gemini-3.5-flash-lite";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
      max_tokens: 4_000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Верни только валидный JSON без markdown." },
        { role: "user", content: input.userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Director plan request failed: ${response.status} ${text.slice(0, 240)}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
    ? (firstChoice as { message?: { content?: unknown } }).message
    : null;
  const content = message && typeof message.content === "string" ? message.content : "";
  if (!content) throw new Error("Director plan request returned no content");
  return content;
}

export async function composeScriptDirectorPlan(input: {
  script: string;
  productSummary: string;
  targetDurationSeconds: number;
  materials: ReturnType<typeof extractMaterialForm>[];
  request: DirectorRequest;
}) {
  const basePrompt = buildScriptDirectorPrompt(input);
  let lastError = "";
  for (let attempt = 1; attempt <= DIRECTOR_ATTEMPTS; attempt += 1) {
    const userPrompt = lastError
      ? `${basePrompt}\n\nПовторная попытка. Исправь проблемы предыдущей раскадровки:\n${lastError}`
      : basePrompt;
    const content = await input.request({ attempt, userPrompt, temperature: attempt === 1 ? 0.7 : 0.2 });
    try {
      return normalizeScriptDirectorPlan(content, input.targetDurationSeconds);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new ScriptDirectorPlanInvalid(`Director plan failed: ${lastError}`);
}

export async function runOmniScriptDirector(input: {
  scriptId: number;
  materialIds?: number[];
  request?: DirectorRequest;
}) {
  await ensureOmniSchema();
  await ensureScriptDirectorSchema();

  const { rows: scriptRows } = await pool.query<{
    id: number;
    project_id: number;
    product_id: number;
    script: string;
    title: string | null;
  }>(
    "SELECT id, project_id, product_id, script, title FROM omni_generated_scripts WHERE id = $1 LIMIT 1",
    [input.scriptId]
  );
  const script = scriptRows[0];
  if (!script) throw new Error("Generated script not found");

  const { rows: productRows } = await pool.query<{
    name: string;
    description: string | null;
    target_duration_seconds: number;
  }>(
    "SELECT name, description, target_duration_seconds FROM omni_products WHERE id = $1 LIMIT 1",
    [script.product_id]
  );
  const product = productRows[0];
  if (!product) throw new Error("Product not found for script");

  const library: OmniProductReferenceLibraryItem[] = await listProductReferenceMaterials(script.product_id, 50);
  const materials = (
    input.materialIds?.length
      ? library.filter((item) => input.materialIds!.includes(item.material_id))
      : library.slice(0, 3)
  ).map(extractMaterialForm);

  const plan = await composeScriptDirectorPlan({
    script: script.script,
    productSummary: `${product.name}${product.description ? ` — ${product.description}` : ""}`,
    targetDurationSeconds: product.target_duration_seconds,
    materials,
    request: input.request || defaultDirectorRequest,
  });

  await pool.query(
    `INSERT INTO omni_script_director_plans (generated_script_id, plan_json, model, updated_at)
     VALUES ($1, $2::jsonb, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (generated_script_id) DO UPDATE SET
       plan_json = EXCLUDED.plan_json,
       model = EXCLUDED.model,
       updated_at = CURRENT_TIMESTAMP`,
    [
      script.id,
      JSON.stringify(plan),
      process.env.SCENARIO_MODEL || "google/gemini-3.5-flash-lite",
    ]
  );

  return { scriptId: script.id, plan };
}

export async function getScriptDirectorPlan(scriptId: number) {
  await ensureScriptDirectorSchema();
  const { rows } = await pool.query<{ plan_json: ScriptDirectorPlan }>(
    "SELECT plan_json FROM omni_script_director_plans WHERE generated_script_id = $1 LIMIT 1",
    [scriptId]
  );
  return rows[0]?.plan_json || null;
}
