import { getReadableS3Url } from "@/lib/server/s3-storage";
import { parseAndRepairJson } from "./script-json-repair";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.5-flash-lite";
const HARD_FAILURE_CODES = new Set([
  "avatar_identity_mismatch", "avatar_identity_drift", "unexpected_speaker",
  "product_missing", "product_shape_or_color_mismatch", "scene_order_mismatch",
  "major_visual_corruption",
]);

export type OmniVisualQaFinding = {
  code: string;
  severity: "warning" | "failed";
  confidence: number;
  message: string;
  timestampSeconds: number | null;
};

export async function runOmniVideoVisualQa(input: {
  videoUrl: string;
  providerPrompt: string | null;
  voiceoverText: string | null;
  creativePlan: unknown;
  storyboardPlan: unknown;
  referenceImages: Array<{ role: string; url: string }>;
  model?: string | null;
}) {
  if (process.env.OMNI_VISUAL_QA_ENABLED === "false") {
    return { status: "pass" as const, model: null, findings: [], skipped: true, reason: "disabled" };
  }
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is not configured for Omni visual QA");
  const model = input.model || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL || DEFAULT_MODEL;
  const readableVideo = await getReadableS3Url(input.videoUrl) || input.videoUrl;
  const images = await Promise.all(input.referenceImages.slice(0, 4).map(async (item) => ({
    ...item,
    url: await getReadableS3Url(item.url) || item.url,
  })));
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Generated Video QA",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VISUAL_QA_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildVisualQaPrompt(input) },
            { type: "video_url", video_url: { url: readableVideo } },
            ...images.flatMap((image) => [
              { type: "text" as const, text: `REFERENCE ROLE: ${image.role}` },
              { type: "image_url" as const, image_url: { url: image.url } },
            ]),
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Omni visual QA request failed: ${response.status} ${text.slice(0, 240)}`);
  }
  const payload = await response.json() as Record<string, unknown>;
  const findings = normalizeVisualQaResponse(parseAndRepairJson(readAssistantContent(payload)));
  return {
    status: aggregate(findings),
    model: String(payload.model || model),
    findings,
    skipped: false,
    responseMetadata: { id: payload.id || null, usage: payload.usage || null },
  };
}

export function normalizeVisualQaResponse(value: unknown): OmniVisualQaFinding[] {
  const source = asRecord(value);
  const raw = Array.isArray(source?.findings) ? source!.findings : [];
  return raw.flatMap((item): OmniVisualQaFinding[] => {
    const finding = asRecord(item);
    const code = String(finding?.code || "").trim().toLowerCase();
    const confidence = clamp(Number(finding?.confidence));
    const message = String(finding?.message || "").trim();
    if (!code || !message || confidence < 0.5) return [];
    const requestedSeverity = finding?.severity === "failed" ? "failed" : "warning";
    const severity = HARD_FAILURE_CODES.has(code) && requestedSeverity === "failed" && confidence >= 0.75
      ? "failed" as const : "warning" as const;
    const timestamp = Number(finding?.timestamp_seconds);
    return [{ code, severity, confidence, message, timestampSeconds: Number.isFinite(timestamp) ? timestamp : null }];
  }).slice(0, 12);
}

const VISUAL_QA_SYSTEM_PROMPT = [
  "You are a strict QA reviewer for an already generated short vertical video.",
  "Observe the supplied generated video and compare it with the expected plan and labeled reference images.",
  "Do not propose repairs and do not rewrite the prompt.",
  "Report only visible defects. Low-confidence suspicions are warnings, never failures.",
  "Allowed codes: avatar_identity_mismatch, avatar_identity_drift, wardrobe_drift, unexpected_speaker, product_missing, product_shape_or_color_mismatch, unexpected_product_or_prop, scene_order_mismatch, unplanned_text_or_interface, major_visual_corruption.",
  "Return JSON only: {\"findings\":[{\"code\":\"...\",\"severity\":\"warning|failed\",\"confidence\":0.0,\"message\":\"observed evidence\",\"timestamp_seconds\":0.0}]}",
].join(" ");

function buildVisualQaPrompt(input: {
  providerPrompt: string | null; voiceoverText: string | null; creativePlan: unknown; storyboardPlan: unknown;
}) {
  return [
    "EXPECTED PROVIDER PROMPT:", input.providerPrompt || "unavailable",
    "EXPECTED VOICEOVER:", input.voiceoverText || "none",
    "EXPECTED CREATIVE PLAN:", JSON.stringify(input.creativePlan || null),
    "EXPECTED STORYBOARD:", JSON.stringify(input.storyboardPlan || null),
    "A product is required only where the expected plan explicitly makes it visible. B-roll does not require a visible avatar. Talking-head frames require the referenced avatar and stable wardrobe.",
  ].join("\n");
}

function readAssistantContent(data: Record<string, unknown>) {
  const choice = Array.isArray(data.choices) ? asRecord(data.choices[0]) : null;
  const content = asRecord(choice?.message)?.content;
  if (typeof content === "string" && content.trim()) return content;
  throw new Error("Omni visual QA returned empty content");
}
function aggregate(findings: OmniVisualQaFinding[]) {
  return findings.some((item) => item.severity === "failed") ? "failed" as const
    : findings.length ? "warning" as const : "pass" as const;
}
function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function clamp(value: number) { return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0; }
