import { parseAndRepairJson } from "./script-json-repair";
import { extractDirectorReferenceFrameBuffers } from "./storyboard-director-references";
import { normalizeDirectorBrief, type DirectorBrief } from "./director-analysis-types";
import { normalizeOpenRouterUsage, type OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";
import type { DirectorAnalysisEvidenceFrame } from "./openrouter-director-analysis-client";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.5-flash-lite";
const MIN_CONFIDENCE = 0.7;
const DIRECTOR_VERIFICATION_REQUEST_TIMEOUT_MS = 90_000;

export type DirectorAnalysisVerification = {
  status: "pass" | "repair";
  confidence: number;
  reasons: string[];
  model: string;
};

export type DirectorAnalysisVerificationResult = {
  brief: DirectorBrief;
  verification: DirectorAnalysisVerification;
  openRouterUsage: OpenRouterUsageRecord;
};

export async function verifyDirectorBriefAgainstReferenceFrames(input: {
  videoUrl: string;
  brief: DirectorBrief;
  model?: string | null;
  evidenceFrames?: readonly DirectorAnalysisEvidenceFrame[];
}): Promise<DirectorAnalysisVerificationResult> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is not configured for director analysis verification");

  const frames = input.evidenceFrames?.length
    ? selectVerificationFrames(input.evidenceFrames)
    : (await extractDirectorReferenceFrameBuffers({ videoUrl: input.videoUrl, maxFrames: 3 }))
      .map((body, index) => ({ timestampSec: index, body }));
  if (frames.length < 2) throw new Error("Director analysis verification needs at least two source frames");

  const model = input.model || process.env.OMNI_DIRECTOR_ANALYSIS_VERIFY_MODEL || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL || DEFAULT_MODEL;
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Director Analysis Frame Verification",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VERIFICATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildVerificationPrompt(input.brief) },
            ...frames.flatMap((frame) => [
              { type: "text" as const, text: `SOURCE FRAME ${frame.timestampSec}s` },
              {
                type: "image_url" as const,
                image_url: { url: `data:image/jpeg;base64,${frame.body.toString("base64")}` },
              },
            ]),
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(DIRECTOR_VERIFICATION_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Director analysis frame verification failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const result = asRecord(parseAndRepairJson(readAssistantContent(data)));
  if (!result) throw new Error("Director analysis frame verifier returned invalid JSON");
  const status = result.status === "repair" ? "repair" : result.status === "pass" ? "pass" : null;
  const confidence = Number(result.confidence);
  const verifiedBrief = normalizeDirectorBrief(result.director_brief);
  if (!status || !verifiedBrief || !Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) {
    throw new Error("Director analysis frame verifier could not confirm the source setup");
  }
  const brief: DirectorBrief = {
    ...verifiedBrief,
    content_adaptation: input.brief.content_adaptation,
    audio_profile: input.brief.audio_profile,
  };

  const responseModel = String(data.model || model);
  const pricing = await getOpenRouterPricingSnapshot(responseModel);

  return {
    brief,
    verification: {
      status,
      confidence,
      reasons: stringArray(result.reasons),
      model: responseModel,
    },
    openRouterUsage: normalizeOpenRouterUsage({
      layer: "director_analysis_verification",
      model,
      response: data,
      pricing,
    }),
  };
}

const VERIFICATION_SYSTEM_PROMPT = [
  "You are a strict video-reference QA reviewer.",
  "Compare the supplied director brief with the attached source frames.",
  "Correct every factual mismatch in location, camera position, movement, lighting, wardrobe continuity, wardrobe timeline, visible subject role, avatar permission, shot composition and visible actions.",
  "Preserve the detailed approximately two-second camera_timeline. Do not collapse independent B-roll intervals into one broad shot. Keep visual_description, composition, visible_objects, source_role, visible_subject_role, avatar_allowed, transition_in, transition_out and adaptation_rule for every interval.",
  "Verify wardrobe independently from format: stable, changes_between_cuts, not_visible or unknown. Keep one timeline interval per visibly different outfit or subject; never replace a wardrobe timeline with one global outfit merely because the source is a montage.",
  "Frames are evidence. Never infer a home or studio when a vehicle cabin is visible.",
  "Return only JSON: status (pass or repair), confidence (0-1), reasons (short array), director_brief (full corrected object). Preserve audio_profile exactly; this field was determined from the full video's audio and is not verifiable from still frames.",
].join(" ");

function buildVerificationPrompt(brief: DirectorBrief) {
  return [
    "Current director brief:",
    JSON.stringify(brief),
    "Return the complete corrected director_brief, keeping the same schema. Preserve the observed format mechanics, not the source creator identity, product brand or text overlays.",
  ].join("\n");
}

function selectVerificationFrames(frames: readonly DirectorAnalysisEvidenceFrame[]) {
  const limit = 8;
  if (frames.length <= limit) return frames;
  return Array.from({ length: limit }, (_, index) => frames[Math.round((index * (frames.length - 1)) / (limit - 1))]);
}

function readAssistantContent(data: Record<string, unknown>) {
  const firstChoice = Array.isArray(data.choices) ? data.choices[0] : null;
  const message = asRecord(firstChoice) ? asRecord(firstChoice)?.message : null;
  const content = asRecord(message)?.content;
  if (typeof content === "string" && content.trim()) return content;
  throw new Error("Director analysis frame verifier returned empty content");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];
}
