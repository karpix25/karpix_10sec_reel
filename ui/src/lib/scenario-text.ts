type ScenarioTextRecord = Record<string, unknown>;

const TEXT_FIELD_PRIORITY = [
  "text",
  "script",
  "body",
  "hook",
  "line",
  "sentence",
  "content",
  "dialogue",
  "spoken_text",
  "voiceover",
  "voice_over",
  "voiceover_text",
  "narration",
  "narrator",
  "narrator_text",
  "visual",
  "visual_note",
  "visual_notes",
];

const normalizeText = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
};

const isRecord = (value: unknown): value is ScenarioTextRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const extractRecordText = (value: ScenarioTextRecord): string => {
  const parts: string[] = [];

  for (const field of TEXT_FIELD_PRIORITY) {
    const text = normalizeText(value[field]);
    if (text) parts.push(text);
  }

  if (Array.isArray(value.segments)) {
    const text = formatScenarioScript(value.segments);
    if (text) parts.push(text);
  }

  return Array.from(new Set(parts)).join("\n");
};

export const formatScenarioScript = (value: unknown, fallback = ""): string => {
  const directText = normalizeText(value);
  if (directText) return directText;

  if (Array.isArray(value)) {
    return value
      .map((item) => (isRecord(item) ? extractRecordText(item) : normalizeText(item)))
      .filter(Boolean)
      .join("\n");
  }

  if (isRecord(value)) {
    return extractRecordText(value);
  }

  return fallback;
};

export const getScenarioScriptPreview = (value: unknown, maxLength = 50): string => {
  const text = formatScenarioScript(value);
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};
