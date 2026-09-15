import { getOmniVoicePreset, OMNI_VOICE_PRESETS } from "@/lib/omni/omni-voice-profile";
import type { OmniAvatarSpeechGender } from "@/lib/omni/avatar-speech-gender";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.5-flash-lite";

export async function selectOmniAvatarVoice(input: {
  displayName?: string | null;
  prompt: string;
  speechGender: OmniAvatarSpeechGender;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for automatic avatar voice selection");

  const model = process.env.OMNI_AVATAR_VOICE_MODEL?.trim() || process.env.SCENARIO_MODEL?.trim() || DEFAULT_MODEL;
  const catalog = OMNI_VOICE_PRESETS
    .filter((preset) => preset.gender === input.speechGender)
    .map((preset) => ({ id: preset.id, label: preset.label, description: preset.description }));
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels avatar voice selector",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Выбери один голос из каталога и верни только JSON вида {\"voice_id\":\"...\",\"reason\":\"...\"}." },
        {
          role: "user",
          content: [
            "Подбери стабильный голос для одного постоянного AI-аватара бренда.",
            `Род речи аватара: ${input.speechGender}. Выбирать можно только голос этого рода.`,
            `Имя аватара: ${input.displayName?.trim() || "не указано"}.`,
            `Описание аватара: ${input.prompt.trim()}`,
            `Каталог: ${JSON.stringify(catalog)}`,
            "Учитывай характер аватара и формат коротких продуктовых видео. Не придумывай voice_id.",
          ].join("\n"),
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Avatar voice selection failed: ${response.status}`);
  const content = readAssistantContent(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Avatar voice selection returned invalid JSON");
  }
  const voiceId = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as { voice_id?: unknown }).voice_id
    : null;
  const preset = getOmniVoicePreset(voiceId);
  if (!preset || preset.gender !== input.speechGender) {
    throw new Error("Avatar voice selection returned an unsupported voice");
  }
  return { preset, source: "llm" as const, model };
}

function readAssistantContent(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const choices = (payload as { choices?: unknown }).choices;
  const first = Array.isArray(choices) ? choices[0] : null;
  const message = first && typeof first === "object" && !Array.isArray(first)
    ? (first as { message?: unknown }).message
    : null;
  return message && typeof message === "object" && !Array.isArray(message)
    ? String((message as { content?: unknown }).content || "")
    : "";
}
