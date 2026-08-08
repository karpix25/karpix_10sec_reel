import type { OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import type {
  StoryboardVisionValidation,
} from "../../omni/storyboard/omni-storyboard-vision-types";
import { parseAndRepairJson } from "./script-json-repair";
import { normalizeStoryboardVisionValidation } from "./storyboard-vision-contract";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "minimax/minimax-m3";

export async function validateStoryboardImage(input: {
  imageUrl: string;
  storyboard: OmniStoryboardSegment;
  productName: string;
  model?: string | null;
}): Promise<StoryboardVisionValidation> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is not configured for storyboard vision validation");
  const model = input.model || process.env.OMNI_STORYBOARD_VISION_MODEL || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL || DEFAULT_MODEL;
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Storyboard Physical Validation",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: STORYBOARD_VISION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildStoryboardVisionPrompt(input.storyboard, input.productName) },
            { type: "image_url", image_url: { url: input.imageUrl } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Storyboard vision validation failed: ${response.status} ${text.slice(0, 240)}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const content = readAssistantContent(data);
  return normalizeStoryboardVisionValidation(parseAndRepairJson(content), String(data.model || model));
}

export const STORYBOARD_VISION_SYSTEM_PROMPT = [
  "You are a strict quality auditor for storyboard contact sheets.",
  "Inspect the generated contact sheet, panel by panel, and compare it with the expected storyboard plan.",
  "Judge physical feasibility, semantic relevance, product fidelity, clean-frame quality, identity and wardrobe continuity, and required reference-format fidelity.",
  "Physical failures include hand-capacity conflicts, unsupported or floating objects, extra hands, impossible transitions, eating or drinking while speaking on camera, and repeated frames.",
  "Semantic failures include any source-reference product, package, box, food, tool, process prop, supporting-worker hand, or unrelated object not required by the spoken line and expected panel. The supplied product is the only commercial product allowed.",
  "Clean-frame failures include visible camera, tripod, rig, light stand, boom mic, cables, crew, monitor, watermark, social UI, or accidental text inside the visual scene. Ignore the required contact-sheet speech, panel labels, panel numbers, and exact supplied-product label.",
  "Format failures include replacing required PIP/collage, numbered reveal, full-frame cutaway, split layout, or reference shot rhythm with a generic centered talking head.",
  "Return only valid JSON with status pass, repair, or block; confidence from 0 to 1; panels; and repair_instructions.",
  "If the image is ambiguous or you cannot verify a physical constraint, return block with low confidence.",
].join(" ");

export function buildStoryboardVisionPrompt(storyboard: OmniStoryboardSegment, productName: string) {
  return [
    "Expected storyboard plan:",
    JSON.stringify({
      product: productName,
      panels: storyboard.frames.map((frame, index) => ({
        panel_index: index + 1,
        speech: frame.spokenText,
        action: frame.visualAction,
        camera: frame.camera,
        environment: frame.environment,
        wardrobe: frame.wardrobe,
        transition_or_format: frame.effectNotes,
        product_placement: frame.productPlacement,
        physical_plan: frame.physicalPlan || null,
      })),
    }),
    "For every panel, verify that the visible image obeys the speech, action, camera, environment, wardrobe, transition_or_format, product_placement, and physical_plan.",
    "Reject literal source-reference objects that are absent from the expected panel, even when their composition or decor comes from the reference. Preserve required format mechanics while replacing source products with the supplied product.",
  ].join("\n");
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
    ? (firstChoice as Record<string, unknown>).message
    : null;
  const content = message && typeof message === "object" && !Array.isArray(message)
    ? (message as Record<string, unknown>).content
    : null;
  if (typeof content === "string" && content.trim()) return content;
  throw new Error("Storyboard vision model returned empty content");
}
