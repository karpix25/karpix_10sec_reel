import type { OmniProject } from "@/lib/omni/types";
import type { Client } from "@/types";

export function buildManualProductRefs(referenceUrl: string) {
  const url = referenceUrl.trim();
  if (!url) return [];

  return [
    {
      id: url,
      url,
      kind: "image",
      role: "product_primary",
      label: "product reference",
      storage_provider: "manual",
      status: "manual_url",
      is_primary: true,
    },
  ];
}

export function resolveProjectLabel(project: OmniProject, clients: Client[]) {
  const linkedClient = project.legacy_client_id
    ? clients.find((client) => client.id === project.legacy_client_id)
    : null;
  return linkedClient?.name || project.name;
}
