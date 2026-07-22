const FOREIGN_REFERENCE_WORLD_PATTERN =
  /clinical|wellness office|medical|doctor|clinic|hospital|stethoscope|scrubs|treatment room|waiting room|vertical blinds|exam room|plants?|plant-filled|potted|клиник|медицин|стетоскоп|врач|кабинет|жалюзи|растени/iu;

const FOREIGN_PROCESS_PATTERN =
  /commercial kitchen|industrial|sterile|stainless-steel|food assembly|food prep|prep table|container|digital scale|sliced meat|gloved hands|staff|workers|цех|производств|контейнер|весы|перчат|работник|сборк|упаков/iu;

const CONTINUITY_VISUAL_MARKERS =
  /Сценарный visual cue:|visual cue:|voiceover:|речь\s*-|ТОЧНАЯ РЕПЛИКА/iu;

export function hasForeignReferenceWorld(text: string) {
  return FOREIGN_REFERENCE_WORLD_PATTERN.test(text) || FOREIGN_PROCESS_PATTERN.test(text);
}

export function sanitizeReferenceWorldText(text: string, fallback: string) {
  const compact = compactPromptPhrase(text);
  if (!compact) return fallback;
  return hasForeignReferenceWorld(compact) ? fallback : compact;
}

export function sanitizeReferenceActionDna(text: string, fallback: string) {
  const compact = compactPromptPhrase(text, 220);
  if (!compact) return fallback;
  return hasForeignReferenceWorld(compact) ? fallback : compact;
}

export function compactPromptPhrase(text: string, maxLength = 150) {
  const beforeMarker = text.split(CONTINUITY_VISUAL_MARKERS)[0]?.trim();
  const source = beforeMarker && beforeMarker.length >= 20 ? beforeMarker : text;
  const normalized = source
    .replace(CONTINUITY_VISUAL_MARKERS, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;

  const sentenceEnd = normalized.slice(0, maxLength).search(/[.!?;:](?!.*[.!?;:])/u);
  if (sentenceEnd >= 60) return normalized.slice(0, sentenceEnd + 1).trim();

  const words = normalized.split(" ");
  const selected: string[] = [];
  for (const word of words) {
    const candidate = [...selected, word].join(" ");
    if (candidate.length > maxLength) break;
    selected.push(word);
  }
  return selected.join(" ").trim();
}
