import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { transcribeAudioFileWithDeepgram } from "./deepgram-transcription";
import { runOmniFfmpeg, runOmniFfprobeDuration } from "./omni-ffmpeg";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";
import { resolveProductIdentityReferenceImageUrls } from "./omni-product-reference-images";
import { parseAndRepairJson } from "./script-json-repair";
import {
  combineOmniSegmentOutputValidation,
  compareOmniSegmentTranscript,
  normalizeOmniSegmentVisualValidation,
  type OmniSegmentOutputValidation,
} from "./omni-segment-output-contract";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "minimax/minimax-m3";

type VisionContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export class OmniSegmentOutputValidationError extends Error {
  constructor(public readonly validation: OmniSegmentOutputValidation) {
    const codes = validation.issues
      .filter((issue) => issue.severity === "critical")
      .map((issue) => issue.code)
      .slice(0, 4)
      .join(", ");
    super(`Output QA rejected segment${codes ? `: ${codes}` : ""}`);
    this.name = "OmniSegmentOutputValidationError";
  }
}

export async function validateOmniSegmentOutput(input: {
  reel: OmniReel;
  segment: OmniReelSegment;
  videoBuffer: Buffer;
}) {
  const workdir = await mkdtemp(join(tmpdir(), "omni-segment-qa-"));
  const videoPath = join(workdir, "segment.mp4");
  const audioPath = join(workdir, "speech.wav");
  const contactSheetPath = join(workdir, "contact-sheet.jpg");
  try {
    await writeFile(videoPath, input.videoBuffer);
    const duration = await runOmniFfprobeDuration(videoPath);
    if (!duration) throw new Error("Output QA could not read generated segment duration");
    await Promise.all([
      extractSpeech(videoPath, audioPath),
      createContactSheet(videoPath, contactSheetPath, duration),
    ]);
    const [transcription, contactSheet] = await Promise.all([
      transcribeAudioFileWithDeepgram(audioPath),
      readFile(contactSheetPath),
    ]);
    const transcript = compareOmniSegmentTranscript(
      input.segment.voiceover_text || "",
      transcription.transcript
    );
    const visual = await validateVisualOutput({
      reel: input.reel,
      segment: input.segment,
      contactSheetUrl: `data:image/jpeg;base64,${contactSheet.toString("base64")}`,
    });
    return combineOmniSegmentOutputValidation({ visual, transcript });
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractSpeech(videoPath: string, audioPath: string) {
  await runOmniFfmpeg([
    "-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", audioPath,
  ]);
}

async function createContactSheet(
  videoPath: string,
  outputPath: string,
  duration: number
) {
  const frames = 8;
  const filter = [
    `fps=${(frames / duration).toFixed(6)}`,
    "scale=270:480:force_original_aspect_ratio=decrease",
    "pad=270:480:(ow-iw)/2:(oh-ih)/2:black",
    "tile=4x2",
  ].join(",");
  await runOmniFfmpeg([
    "-y", "-i", videoPath, "-vf", filter, "-frames:v", "1", "-q:v", "2", outputPath,
  ]);
}

async function validateVisualOutput(input: {
  reel: OmniReel;
  segment: OmniReelSegment;
  contactSheetUrl: string;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured for output QA");
  const model = process.env.OMNI_SEGMENT_OUTPUT_VISION_MODEL ||
    process.env.OMNI_STORYBOARD_VISION_MODEL ||
    process.env.OMNI_DIRECTOR_ANALYSIS_MODEL ||
    DEFAULT_MODEL;
  const productName = cleanText(input.reel.product_snapshot?.name) ||
    cleanText(input.reel.product_snapshot?.product_name);
  const productVisible = hasProductVisibleStoryboardFrame(input.segment.storyboard_plan, productName) ||
    Boolean(input.segment.creative_plan?.productRole && input.segment.creative_plan.productRole !== "hidden");
  const avatarUrl = cleanText(input.reel.avatar_snapshot?.reference_url);
  if (!avatarUrl) throw new Error("Output QA requires an avatar reference image");
  const productUrl = productVisible
    ? resolveProductIdentityReferenceImageUrls(input.reel.product_snapshot || {})[0] || ""
    : "";
  if (productVisible && !productUrl) throw new Error("Output QA requires a canonical product image");

  const content: VisionContent[] = [
    { type: "text", text: buildVisionPrompt(input, productName, productVisible) },
    { type: "image_url", image_url: { url: avatarUrl } },
  ];
  if (productUrl) content.push({ type: "image_url", image_url: { url: productUrl } });
  if (input.segment.storyboard_reference_url) {
    content.push({ type: "image_url", image_url: { url: input.segment.storyboard_reference_url } });
  }
  content.push({ type: "image_url", image_url: { url: input.contactSheetUrl } });

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Segment Output QA",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VISION_SYSTEM_PROMPT },
        { role: "user", content },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Output vision QA failed: ${response.status} ${text.slice(0, 240)}`);
  }
  const data = await response.json() as Record<string, unknown>;
  return normalizeOmniSegmentVisualValidation(
    parseAndRepairJson(readAssistantContent(data)) as unknown,
    String(data.model || model)
  );
}

const VISION_SYSTEM_PROMPT = [
  "You are a strict final-video quality auditor for short vertical ads.",
  "The supplied images are ordered as: avatar identity; canonical product if expected; approved storyboard if available; final chronological 8-frame contact sheet.",
  "Block wrong person or gender, identity drift, product shape/color/label/state drift, impossible anatomy or object physics, unexplained foam/liquid/leaks, floating objects, filmstrip artifacts, camera gear, social UI, subtitles, watermarks, accidental text, or unrelated props copied from a reference.",
  "Also block replacing a required collage/PIP, numbered progression, split layout, decor anchor, cutaway, camera rhythm, wardrobe, or environment with a generic talking head.",
  "Do not penalize a faithful structural layout merely because it contains useful decor. Judge whether each element serves the approved plan.",
  "Return only JSON: {status:'pass'|'block',score:0..100,confidence:0..1,issues:[{code,severity:'critical'|'warning',message,evidence}]}. If uncertain about identity, product, or physics, block.",
].join(" ");

function buildVisionPrompt(
  input: { reel: OmniReel; segment: OmniReelSegment },
  productName: string,
  productVisible: boolean
) {
  return [
    `Segment ${input.segment.segment_index}; product expected: ${productVisible ? "yes" : "no"}.`,
    "Approved contract:",
    JSON.stringify({
      avatar: {
        display_name: input.reel.avatar_snapshot?.display_name,
        appearance: input.reel.avatar_snapshot?.prompt,
        speech_gender: input.reel.avatar_snapshot?.speech_gender,
      },
      product: productVisible ? {
        name: productName,
        visual_profile: input.reel.product_snapshot?.product_visual_profile,
        physical_contract: input.reel.product_snapshot?.product_physical_contract,
      } : { name: productName, visibility: "hidden" },
      creative_strategy: input.reel.creative_strategy,
      creative_plan: input.segment.creative_plan,
      storyboard_plan: input.segment.storyboard_plan,
      exact_voiceover: input.segment.voiceover_text,
    }),
    "Read the contact sheet left-to-right across the top row, then left-to-right across the bottom row. Report concrete visual evidence for every issue.",
  ].join("\n");
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const message = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as { message?: { content?: unknown } }).message
    : null;
  if (typeof message?.content === "string" && message.content.trim()) return message.content;
  throw new Error("Output vision QA returned empty content");
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
