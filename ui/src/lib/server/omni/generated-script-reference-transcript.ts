import type { OmniLegacyScenario } from "@/lib/omni/types";

export function resolveGeneratedScriptReferenceTranscript(
  sourceScenario: OmniLegacyScenario,
  directorSourceSnapshot: Record<string, unknown> | null | undefined,
) {
  const storedTranscript = directorSourceSnapshot?.reference_transcript;
  if (typeof storedTranscript === "string" && storedTranscript.trim()) return storedTranscript.trim();
  return sourceScenario.script.trim();
}
