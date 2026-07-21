export const AUDIO_MOODS = ["energetic", "calm", "dramatic", "inspiring", "playful", "serious"] as const;

export type AudioMood = (typeof AUDIO_MOODS)[number];

export type AudioMoodOption = {
  id: AudioMood;
  label: string;
  description: string;
};

export const AUDIO_MOOD_OPTIONS: AudioMoodOption[] = [
  {
    id: "energetic",
    label: "Энергично",
    description: "Драйв, темп, уверенный запуск и быстрые продажи.",
  },
  {
    id: "calm",
    label: "Спокойно",
    description: "Мягкая подача, уход, доверие и аккуратный ритм.",
  },
  {
    id: "dramatic",
    label: "Драматично",
    description: "Боль, напряжение, переломный момент и сильный контраст.",
  },
  {
    id: "inspiring",
    label: "Вдохновляюще",
    description: "Рост, надежда, результат и ощущение движения вперед.",
  },
  {
    id: "playful",
    label: "Легко",
    description: "Ирония, легкость, живой бытовой вайб и простая динамика.",
  },
  {
    id: "serious",
    label: "Серьезно",
    description: "Экспертность, разбор, факты и спокойная уверенность.",
  },
];

const AUDIO_MOOD_SET = new Set<string>(AUDIO_MOODS);

const MOOD_KEYWORDS: Record<AudioMood, string[]> = {
  energetic: [
    "быстро",
    "срочно",
    "энерг",
    "запуск",
    "рост продаж",
    "рывок",
    "динами",
    "взрыв",
    "буст",
  ],
  calm: ["спокой", "мягк", "уход", "нежн", "комфорт", "расслаб", "береж", "сон", "рутин"],
  dramatic: ["боль", "проблем", "ошибк", "страх", "провал", "лома", "кризис", "теря", "никогда"],
  inspiring: ["получится", "результат", "мечт", "вдохнов", "начни", "смож", "лучше", "измен", "путь"],
  playful: ["смеш", "легко", "шут", "ха", "прикол", "забав", "прост", "бытов", "не заморач"],
  serious: ["разбор", "факт", "важно", "эксперт", "почему", "сравн", "объяс", "система", "метод"],
};

export function normalizeAudioMood(value: unknown, fallback: AudioMood = "serious"): AudioMood {
  const normalized = String(value || "").trim().toLowerCase();
  return AUDIO_MOOD_SET.has(normalized) ? (normalized as AudioMood) : fallback;
}

export function getAudioMoodLabel(mood: AudioMood) {
  return AUDIO_MOOD_OPTIONS.find((option) => option.id === mood)?.label || mood;
}

export function detectAudioMoodFromText(text: string): AudioMood {
  const normalized = text.toLowerCase();
  const scored = AUDIO_MOODS.map((mood) => ({
    mood,
    score: MOOD_KEYWORDS[mood].reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0),
  })).sort((left, right) => right.score - left.score);

  return scored[0]?.score ? scored[0].mood : "serious";
}
