import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { parseAndRepairJson } from "./script-json-repair";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "minimax/minimax-m3";
const REQUEST_TIMEOUT_MS = 20_000;
const PATCH_FIELDS = ["visualAction", "productPlacement", "sfxNotes", "effectNotes"] as const;
const FOREIGN_OBJECT_PATTERN = /(?:сыр|морков|перекус|яблок|банан|фрукт|овощ|чуж(?:ой|ая|ое|ие)|foreign|snack|carrot|cheese|apple|banana)/iu;
const REPAIR_CACHE_LIMIT = 128;
const repairCache = new Map<string, PhysicalStoryboardRepairResult>();

type PhysicalPatchField = (typeof PATCH_FIELDS)[number];

export type PhysicalStoryboardFramePatch = {
  frameIndex: number;
  visualAction?: string;
  productPlacement?: string;
  sfxNotes?: string;
  effectNotes?: string | null;
};

export type PhysicalStoryboardRepairResult = {
  patch: { frames: PhysicalStoryboardFramePatch[] };
  model: string;
  error: string | null;
};

export async function repairPhysicalStoryboardSegment(input: {
  segment: OmniStoryboardSegment;
  productName: string;
  validationErrors: readonly string[];
  model?: string | null;
}): Promise<PhysicalStoryboardRepairResult> {
  const model = resolveModel(input.model);
  const cacheKey = JSON.stringify({
    model,
    productName: input.productName,
    validationErrors: input.validationErrors,
    segment: input.segment,
  });
  const cached = repairCache.get(cacheKey);
  if (cached) return cached;

  const result = await requestPhysicalStoryboardRepair({ ...input, model });
  if (!result.error && result.patch.frames.length) {
    if (repairCache.size >= REPAIR_CACHE_LIMIT) repairCache.delete(repairCache.keys().next().value as string);
    repairCache.set(cacheKey, result);
  }
  return result;
}

async function requestPhysicalStoryboardRepair(input: {
  segment: OmniStoryboardSegment;
  productName: string;
  validationErrors: readonly string[];
  model: string;
}): Promise<PhysicalStoryboardRepairResult> {
  const model = input.model;
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) return fallback(model, "OPENROUTER_API_KEY is not configured");

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
        "X-Title": "Omni Reels Physical Storyboard Repair",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PHYSICAL_STORYBOARD_REPAIR_SYSTEM_PROMPT },
          { role: "user", content: buildRepairUserPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return fallback(model, `OpenRouter request failed: ${response.status} ${text.slice(0, 200)}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const parsed = parseAndRepairJson(readAssistantContent(data)) as unknown;
    return {
      patch: validatePatch(parsed, input.segment, input.productName),
      model: String(data.model || model),
      error: null,
    };
  } catch (error) {
    return fallback(model, error instanceof Error ? error.message : "Physical storyboard repair failed");
  }
}

export const PHYSICAL_STORYBOARD_REPAIR_SYSTEM_PROMPT = [
  "You repair physical continuity in a storyboard segment.",
  "Return JSON only with exactly this shape: {\"frames\":[{\"frameIndex\":1,\"visualAction\":\"...\"}] }.",
  "frameIndex is 1-based. Include only frames that need visual correction.",
  "Allowed patch fields are visualAction, productPlacement, sfxNotes, effectNotes.",
  "Never return spokenText, voiceoverText, camera, environment, wardrobe, or any other field.",
  "Keep speech unchanged. Make actions physically possible: no speaking while biting, chewing, swallowing, or drinking; no driving actions while the vehicle moves; no foreign products; no object levitation or multiple held objects.",
  "Preserve the requested product identity and change only visual fields needed to resolve the listed errors.",
].join(" ");

function buildRepairUserPrompt(input: {
  segment: OmniStoryboardSegment;
  productName: string;
  validationErrors: readonly string[];
}) {
  return JSON.stringify({
    productName: input.productName,
    validationErrors: input.validationErrors,
    segment: input.segment,
    contract: "Return only a visual patch. Do not rewrite any spoken text.",
  });
}

function resolveModel(model?: string | null) {
  return model?.trim() || process.env.OMNI_PHYSICAL_SCENE_REPAIR_MODEL?.trim() || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL?.trim() || DEFAULT_MODEL;
}

function validatePatch(value: unknown, segment: OmniStoryboardSegment, productName: string) {
  if (!isRecord(value) || !Object.keys(value).every((key) => key === "frames") || !Array.isArray(value.frames)) {
    throw new Error("Physical storyboard repair returned an invalid patch envelope");
  }

  const seen = new Set<number>();
  const frames = value.frames.map((frame) => {
    if (!isRecord(frame) || typeof frame.frameIndex !== "number" || !Number.isInteger(frame.frameIndex)) {
      throw new Error("Physical storyboard repair returned an invalid frame index");
    }
    if (frame.frameIndex < 1 || frame.frameIndex > segment.frames.length || seen.has(frame.frameIndex)) {
      throw new Error("Physical storyboard repair returned an out-of-range or duplicate frame index");
    }
    seen.add(frame.frameIndex);

    const keys = Object.keys(frame);
    if (!keys.every((key) => key === "frameIndex" || PATCH_FIELDS.includes(key as PhysicalPatchField))) {
      throw new Error("Physical storyboard repair attempted to change a non-visual field");
    }
    const patch: PhysicalStoryboardFramePatch = { frameIndex: frame.frameIndex };
    for (const field of PATCH_FIELDS) {
      if (field in frame) {
        const fieldValue = validateField(field, frame[field]);
        if (typeof fieldValue === "string" && field !== "effectNotes" &&
            (field === "visualAction" || field === "productPlacement") &&
            FOREIGN_OBJECT_PATTERN.test(fieldValue) &&
            !fieldValue.toLocaleLowerCase().includes(productName.toLocaleLowerCase())) {
          throw new Error("Physical storyboard repair introduced a foreign object");
        }
        assignField(patch, field, fieldValue);
      }
    }
    if (Object.keys(patch).length === 1) throw new Error("Physical storyboard repair returned an empty frame patch");
    return patch;
  });

  return { frames };
}

function validateField(field: PhysicalPatchField, value: unknown) {
  if (field === "effectNotes" && value === null) return null;
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${field} in physical storyboard repair patch`);
  return value.trim();
}

function assignField(patch: PhysicalStoryboardFramePatch, field: PhysicalPatchField, value: string | null) {
  if (field === "visualAction") patch.visualAction = value as string;
  else if (field === "productPlacement") patch.productPlacement = value as string;
  else if (field === "sfxNotes") patch.sfxNotes = value as string;
  else patch.effectNotes = value;
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const message = isRecord(choices[0]) && isRecord(choices[0].message) ? choices[0].message : null;
  if (message && typeof message.content === "string") return message.content;
  throw new Error("Physical storyboard repair model returned empty content");
}

function fallback(model: string, error: string): PhysicalStoryboardRepairResult {
  return { patch: { frames: [] }, model, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
