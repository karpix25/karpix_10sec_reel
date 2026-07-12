import type { OmniClientAvatar, OmniLegacyLibraryLink, OmniProduct, OmniProject, OmniReel } from "@/lib/omni/types";
import type { Client } from "@/types";

export type OmniReadinessKey = "workspace" | "product" | "avatar" | "library" | "scenario" | "reel";

export type OmniReadinessItem = {
  key: OmniReadinessKey;
  label: string;
  done: boolean;
};

export function getClientWorkspaceDescription(client: Pick<Client, "id">) {
  return `legacy-client:${client.id}`;
}

export function findClientWorkspaceProject(projects: OmniProject[], client: Client | null) {
  if (!client) return null;
  const description = getClientWorkspaceDescription(client);
  return (
    projects.find(
      (project) =>
        project.legacy_client_id === client.id ||
        project.description === description ||
        project.name === client.name
    ) || null
  );
}

export function getSegmentPlan(targetDurationSeconds: number) {
  const normalizedDuration = targetDurationSeconds >= 40 ? 40 : 30;
  return {
    durationSeconds: normalizedDuration,
    segmentCount: Math.max(1, Math.ceil(normalizedDuration / 10)),
  };
}

export function getLatestAvatar(avatars: OmniClientAvatar[]) {
  return avatars.find((avatar) => avatar.is_active) || avatars[0] || null;
}

export function getActiveProduct(products: OmniProduct[], productId: number | null) {
  return products.find((product) => product.id === productId) || null;
}

export function getEffectiveLegacyLibraryId(activeLibraryId: number | null, links: OmniLegacyLibraryLink[]) {
  return activeLibraryId || Number(links[0]?.legacy_client_id || 0) || null;
}

export function buildReadiness({
  activeProject,
  activeProduct,
  latestAvatar,
  activeLibraryId,
  selectedScenarioId,
  reels,
}: {
  activeProject: OmniProject | null;
  activeProduct: OmniProduct | null;
  latestAvatar: OmniClientAvatar | null;
  activeLibraryId: number | null;
  selectedScenarioId: number | null;
  reels: OmniReel[];
}): OmniReadinessItem[] {
  return [
    { key: "workspace", label: "Карточка бренда", done: Boolean(activeProject) },
    { key: "product", label: "Продукт выбран", done: Boolean(activeProduct) },
    { key: "avatar", label: "Avatar draft", done: Boolean(latestAvatar) },
    { key: "library", label: "Библиотека подключена", done: Boolean(activeLibraryId) },
    { key: "scenario", label: "Сценарий выбран", done: Boolean(selectedScenarioId) },
    { key: "reel", label: "Draft reel создан", done: reels.length > 0 },
  ];
}
