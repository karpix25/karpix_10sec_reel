export type DirectorFormatBeat = {
  id: string;
  narrative_function: string;
  presenter_action: string;
  visual_action: string;
  speech_relation: string;
  transition_in: string;
  transition_out: string;
  repeat_group: string | null;
  required: boolean;
};

export type DirectorRepeatedPattern = {
  enabled: boolean;
  beat_ids: string[];
  observed_repetitions: number;
  minimum_adapted_repetitions: number;
};

export type DirectorFormatGrammar = {
  opening_pattern: string;
  beat_sequence: DirectorFormatBeat[];
  repeated_pattern: DirectorRepeatedPattern;
  ending_pattern: string;
  required_visual_mechanics: string[];
  invariants: string[];
  prohibited_simplifications: string[];
};

export function normalizeDirectorFormatGrammar(value: unknown): DirectorFormatGrammar | undefined {
  if (!isRecord(value)) return undefined;
  const beatSequence = Array.isArray(value.beat_sequence)
    ? value.beat_sequence.map(normalizeBeat).filter((beat): beat is DirectorFormatBeat => Boolean(beat))
    : [];
  const repeated = isRecord(value.repeated_pattern) ? value.repeated_pattern : {};
  const grammar: DirectorFormatGrammar = {
    opening_pattern: text(value.opening_pattern),
    beat_sequence: beatSequence,
    repeated_pattern: {
      enabled: repeated.enabled === true,
      beat_ids: texts(repeated.beat_ids),
      observed_repetitions: nonNegativeInteger(repeated.observed_repetitions),
      minimum_adapted_repetitions: nonNegativeInteger(repeated.minimum_adapted_repetitions),
    },
    ending_pattern: text(value.ending_pattern),
    required_visual_mechanics: texts(value.required_visual_mechanics),
    invariants: texts(value.invariants),
    prohibited_simplifications: texts(value.prohibited_simplifications),
  };
  return grammar.opening_pattern && grammar.beat_sequence.length && grammar.ending_pattern
    ? grammar
    : undefined;
}

export function renderDirectorFormatGrammarForPrompt(grammar?: DirectorFormatGrammar | null) {
  if (!grammar) return "FORMAT GRAMMAR: unavailable. Infer the presentation operations from the verified reference analysis.";
  const sequence = grammar.beat_sequence.map((beat, index) => [
    `${index + 1}. [${beat.id}] ${beat.narrative_function}`,
    `presenter: ${beat.presenter_action || "none"}`,
    `visual: ${beat.visual_action || "none"}`,
    `speech relation: ${beat.speech_relation || "none"}`,
    `transition: ${beat.transition_in || "none"} -> ${beat.transition_out || "none"}`,
    `repeat group: ${beat.repeat_group || "none"}`,
    `required: ${beat.required ? "yes" : "no"}`,
  ].join("; ")).join("\n");
  const repeated = grammar.repeated_pattern.enabled
    ? `Repeat beats ${grammar.repeated_pattern.beat_ids.join(", ")} at least ${grammar.repeated_pattern.minimum_adapted_repetitions} times in the adaptation. The source repeats them ${grammar.repeated_pattern.observed_repetitions} times.`
    : "No repeated cycle is required.";
  return [
    "IMMUTABLE FORMAT GRAMMAR FROM THE REFERENCE:",
    `Opening operation: ${grammar.opening_pattern}`,
    sequence,
    repeated,
    `Ending operation: ${grammar.ending_pattern}`,
    `Required visible mechanics: ${grammar.required_visual_mechanics.join("; ") || "none"}`,
    `Invariants: ${grammar.invariants.join("; ") || "none"}`,
    `Forbidden simplifications: ${grammar.prohibited_simplifications.join("; ") || "none"}`,
    "Preserve these operations, their order, roles, repetitions, and visible mechanics. Replace only the subject matter, examples, identity, and product. Do not flatten the format into a generic monologue, list, or unrelated B-roll.",
  ].join("\n");
}

function normalizeBeat(value: unknown): DirectorFormatBeat | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const narrativeFunction = text(value.narrative_function);
  if (!id || !narrativeFunction) return null;
  return {
    id,
    narrative_function: narrativeFunction,
    presenter_action: text(value.presenter_action),
    visual_action: text(value.visual_action),
    speech_relation: text(value.speech_relation),
    transition_in: text(value.transition_in),
    transition_out: text(value.transition_out),
    repeat_group: text(value.repeat_group) || null,
    required: value.required !== false,
  };
}

function texts(value: unknown) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
