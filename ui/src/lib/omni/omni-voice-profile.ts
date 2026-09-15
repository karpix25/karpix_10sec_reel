import type { OmniAvatarSpeechGender } from "./avatar-speech-gender";

export type OmniVoicePreset = {
  id: string;
  label: string;
  gender: OmniAvatarSpeechGender;
  description: string;
  exampleDialogue: string;
};

export const OMNI_VOICE_PRESETS: readonly OmniVoicePreset[] = [
  { id: "achernar", label: "Achernar — спокойный и ясный", gender: "male", description: "Calm, clear, friendly male voice for explainers and everyday conversation.", exampleDialogue: "Здравствуйте, я расскажу об этом простыми словами." },
  { id: "charon", label: "Charon — уверенный и информативный", gender: "male", description: "Confident, informative male voice with a steady professional delivery.", exampleDialogue: "Давайте разберёмся, как это работает." },
  { id: "fenrir", label: "Fenrir — энергичный и напористый", gender: "male", description: "Energetic, decisive male voice for hooks, reviews and dynamic reels.", exampleDialogue: "Смотрите, вот что действительно важно." },
  { id: "orus", label: "Orus — тёплый и убедительный", gender: "male", description: "Warm, persuasive male voice with a natural creator feel.", exampleDialogue: "Я покажу решение, которое легко применить сегодня." },
  { id: "puck", label: "Puck — живой и лёгкий", gender: "male", description: "Lively, approachable male voice for casual UGC and social content.", exampleDialogue: "Попробуйте так, и вы сразу заметите разницу." },
  { id: "aoede", label: "Aoede — мягкий и мелодичный", gender: "female", description: "Warm, melodic female voice with a natural and empathetic delivery.", exampleDialogue: "Давайте спокойно посмотрим, что поможет именно здесь." },
  { id: "autonoe", label: "Autonoe — яркий и уверенный", gender: "female", description: "Bright, confident female voice for energetic hooks and recommendations.", exampleDialogue: "Вот простой способ сделать это лучше." },
  { id: "callirrhoe", label: "Callirrhoe — естественный и дружелюбный", gender: "female", description: "Easygoing, friendly female voice for conversational creator content.", exampleDialogue: "Я нашла удобный вариант и покажу, как им пользоваться." },
  { id: "kore", label: "Kore — деловой и собранный", gender: "female", description: "Firm, composed female voice for expert, business and product explainers.", exampleDialogue: "Сначала определим задачу, затем выберем подходящее решение." },
  { id: "zephyr", label: "Zephyr — свежий и лёгкий", gender: "female", description: "Fresh, light female voice with a modern social-video delivery.", exampleDialogue: "Сейчас покажу короткий приём, который экономит время." },
];

export function getOmniVoicePreset(id: unknown) {
  if (typeof id !== "string") return null;
  const normalized = id.trim().toLowerCase();
  return OMNI_VOICE_PRESETS.find((preset) => preset.id === normalized) || null;
}

export function getOmniVoicePresetLabel(id: unknown) {
  return getOmniVoicePreset(id)?.label || "Автовыбор LLM";
}
