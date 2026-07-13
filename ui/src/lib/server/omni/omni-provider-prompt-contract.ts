const EXACT_VOICEOVER_LINE = /^ТОЧНАЯ РЕПЛИКА:/u;

const PROVIDER_PLATFORM_IMPRINT_REPLACEMENTS: readonly {
  pattern: RegExp;
  replacement: string;
}[] = [
  { pattern: /instagram\s+reels/giu, replacement: "вертикальное видео" },
  { pattern: /youtube\s+shorts/giu, replacement: "вертикальное видео" },
  { pattern: /коротк(?:ий|ого|ом)\s+reels?/giu, replacement: "короткое вертикальное видео" },
  { pattern: /одного\s+непрерывного\s+reels?/giu, replacement: "одного непрерывного вертикального видео" },
  { pattern: /\breels?\b/giu, replacement: "вертикальное видео" },
  { pattern: /\binstagram\b/giu, replacement: "вертикальное видео" },
  { pattern: /\btiktok\b/giu, replacement: "вертикальное видео" },
  { pattern: /\bshorts\b/giu, replacement: "вертикальное видео" },
  { pattern: /инстаграм(?:а|е|ом)?/giu, replacement: "вертикальное видео" },
  { pattern: /инста(?:грам)?/giu, replacement: "вертикальное видео" },
  { pattern: /рилс(?:а|ы|е|ом|ов)?/giu, replacement: "вертикальное видео" },
  { pattern: /тикток(?:а|е|ом)?/giu, replacement: "вертикальное видео" },
  { pattern: /ютуб\s*шортс(?:а|ов|е)?/giu, replacement: "вертикальное видео" },
  { pattern: /шортс(?:а|ов|е)?/giu, replacement: "вертикальное видео" },
];

const PROVIDER_PLATFORM_IMPRINT_PATTERNS = PROVIDER_PLATFORM_IMPRINT_REPLACEMENTS.map((item) => item.pattern);

export const OMNI_CLEAN_FRAME_PROMPT =
  "Чистый полноэкранный кадр без экранной графики, рамок и декоративных элементов поверх изображения.";

export const OMNI_PROVIDER_CONTINUOUS_SYSTEM_PROMPT = [
  "Сделай живое короткое вертикальное видео 9:16 одним непрерывным телефонным кадром.",
  OMNI_CLEAN_FRAME_PROMPT,
  "Описывай только физически выполнимые действия и точную речь.",
].join(" ");

export function prepareProviderVideoPrompt(prompt: string) {
  const sanitized = sanitizeProviderPromptImprints(prompt);
  assertProviderPromptHasNoPlatformImprints(sanitized);
  return sanitized;
}

export function sanitizeProviderPromptImprints(prompt: string) {
  return mapProviderInstructionLines(prompt, (line) =>
    PROVIDER_PLATFORM_IMPRINT_REPLACEMENTS.reduce(
      (current, replacement) => current.replace(replacement.pattern, replacement.replacement),
      line
    )
  );
}

export function getProviderPromptImprintMatches(prompt: string) {
  const instructionSurface = getProviderInstructionSurface(prompt).toLowerCase();
  return Array.from(
    new Set(
      PROVIDER_PLATFORM_IMPRINT_PATTERNS.flatMap((pattern) => {
        pattern.lastIndex = 0;
        return [...instructionSurface.matchAll(pattern)].map((match) => match[0]);
      })
    )
  );
}

export function assertProviderPromptHasNoPlatformImprints(prompt: string) {
  const matches = getProviderPromptImprintMatches(prompt);
  if (matches.length) {
    throw new Error(`Provider prompt contains platform imprint cues: ${matches.join(", ")}`);
  }
}

function mapProviderInstructionLines(prompt: string, transform: (line: string) => string) {
  return prompt
    .split("\n")
    .map((line) => (EXACT_VOICEOVER_LINE.test(line) ? line : transform(line)))
    .join("\n");
}

function getProviderInstructionSurface(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => (EXACT_VOICEOVER_LINE.test(line) ? "" : line))
    .join("\n");
}
