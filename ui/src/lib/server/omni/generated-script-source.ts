import type { OmniLegacyScenario } from "@/lib/omni/types";
import { getLegacyScenario, getRandomLegacyScenarioFromClients } from "./legacy-scenarios";
import { listLegacyLibraryLinks } from "./legacy-library-links";

export type GeneratedScriptSourceMode = "random_active_legacy_reference" | "selected_legacy_reference";

export async function resolveGeneratedScriptSource(input: {
  projectId: number;
  productId: number;
  legacyScenarioId?: number | null;
}): Promise<{
  sourceScenario: OmniLegacyScenario;
  sourceMode: GeneratedScriptSourceMode;
}> {
  const legacyClientIds = await listActiveLegacyClientIds(input.projectId, input.productId);
  if (!legacyClientIds.length) {
    throw new Error("No active legacy bundles for this project");
  }

  if (input.legacyScenarioId) {
    const sourceScenario = await getLegacyScenario(input.legacyScenarioId);
    if (!sourceScenario || !sourceScenario.script.trim()) {
      throw new Error("Selected legacy scenario was not found");
    }
    if (!sourceScenario.client_id || !legacyClientIds.includes(sourceScenario.client_id)) {
      throw new Error("Selected legacy scenario is not from an active legacy bundle");
    }
    return { sourceScenario, sourceMode: "selected_legacy_reference" };
  }

  const sourceScenario = await getRandomLegacyScenarioFromClients(legacyClientIds);
  if (!sourceScenario) {
    throw new Error("No reference transcripts found in active legacy bundles");
  }
  return { sourceScenario, sourceMode: "random_active_legacy_reference" };
}

async function listActiveLegacyClientIds(projectId: number, productId: number) {
  const projectLinks = await listLegacyLibraryLinks(projectId, null);
  const productLinks = await listLegacyLibraryLinks(projectId, productId);
  return Array.from(
    new Set(
      [...projectLinks, ...productLinks]
        .map((link) => link.legacy_client_id)
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
}
