import { parseAndRepairJson } from "./script-json-repair";
import { normalizeDirectorBrief, type DirectorBrief } from "./director-analysis-types";
import {
  buildDirectorAnalysisUserPrompt,
  DIRECTOR_ANALYSIS_SYSTEM_PROMPT,
} from "./director-analysis-prompt";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_DIRECTOR_MODEL = "minimax/minimax-m3";

export type DirectorVideoAnalysisResult = {
  brief: DirectorBrief;
  model: string;
  responseMetadata: Record<string, unknown>;
};

export async function analyzeDirectorVideo(input: {
  videoUrl: string;
  transcript: string;
  model?: string | null;
}): Promise<DirectorVideoAnalysisResult> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is not configured");

  const model = input.model || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL || DEFAULT_DIRECTOR_MODEL;
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Director Analysis",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: DIRECTOR_ANALYSIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: buildDirectorAnalysisUserPrompt({ transcript: input.transcript }) },
            { type: "video_url", video_url: { url: input.videoUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Director analysis model request failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const content = readAssistantContent(data);
  const parsed = parseAndRepairJson(content);
  const brief = normalizeDirectorBrief(parsed);
  if (!brief) throw new Error("Director analysis model returned invalid director_brief JSON");

  return {
    brief,
    model,
    responseMetadata: {
      id: data.id || null,
      model: data.model || model,
      usage: data.usage || null,
    },
  };
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
    ? (firstChoice as Record<string, unknown>).message
    : null;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }
  throw new Error("Director analysis model returned empty content");
}
