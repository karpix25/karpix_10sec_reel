"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateOmniProject, useOmniProjects } from "@/hooks/useOmniStudio";
import { resolveProjectLabel } from "@/lib/omni/navigator";
import type { Client } from "@/types";

type NavigatorProps = {
  clients: Client[];
  selectedClient: Client | null;
  selectedClientId: string;
  selectedProjectId: number | null;
  isLoadingClients: boolean;
  onSelectClientId: (id: string) => void;
  onSelectProjectId: (id: number | null) => void;
  onSelectProductId: (id: number | null) => void;
  onOpenOmni: () => void;
};

const emptyClientDraft = { name: "", description: "", targetAudience: "", brandVoice: "" };

export function ClientProductNavigator({
  clients,
  selectedClient,
  selectedClientId,
  selectedProjectId,
  isLoadingClients,
  onSelectClientId,
  onSelectProjectId,
  onSelectProductId,
  onOpenOmni,
}: NavigatorProps) {
  const [clientDraft, setClientDraft] = useState(emptyClientDraft);
  const projectsQuery = useOmniProjects();
  const createProjectMutation = useCreateOmniProject();
  const projects = useMemo(() => projectsQuery.data || [], [projectsQuery.data]);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;
  const clientSelectValue = selectedProjectId
    ? `project:${selectedProjectId}`
    : selectedClientId
      ? `legacy:${selectedClientId}`
      : "";

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    const exists = projects.some((project) => project.id === selectedProjectId);
    if (!projectsQuery.isLoading && !exists) {
      onSelectProjectId(null);
      onSelectProductId(null);
    }
  }, [onSelectProductId, onSelectProjectId, projects, projectsQuery.isLoading, selectedProjectId]);

  const handleSelectClient = (value: string) => {
    onSelectProductId(null);
    onOpenOmni();

    if (value.startsWith("project:")) {
      const projectId = Number(value.replace("project:", ""));
      const project = projects.find((item) => item.id === projectId) || null;
      onSelectProjectId(projectId);
      onSelectClientId(project?.legacy_client_id ? String(project.legacy_client_id) : "");
      return;
    }

    const legacyClientId = value.replace("legacy:", "");
    onSelectProjectId(null);
    onSelectClientId(legacyClientId);
  };

  const handleCreateClient = async () => {
    const name = clientDraft.name.trim();
    if (!name) return;

    const project = await createProjectMutation.mutateAsync({
      name,
      description: clientDraft.description.trim() || undefined,
      targetAudience: clientDraft.targetAudience.trim() || undefined,
      brandVoice: clientDraft.brandVoice.trim() || undefined,
    });
    onSelectClientId("");
    onSelectProjectId(project.id);
    onSelectProductId(null);
    setClientDraft(emptyClientDraft);
    onOpenOmni();
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Клиент</p>
          {selectedProject || selectedClient ? (
            <Badge variant="outline" className="max-w-[8rem] truncate">
              {selectedProject ? "Omni" : "Legacy"}
            </Badge>
          ) : null}
        </div>

        <select
          value={clientSelectValue}
          onChange={(event) => handleSelectClient(event.target.value)}
          disabled={isLoadingClients || (!clients.length && !projects.length)}
          className="h-12 w-full rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">Выберите клиента</option>
          {projects.map((project) => (
            <option key={`project-${project.id}`} value={`project:${project.id}`}>
              {resolveProjectLabel(project, clients)}
            </option>
          ))}
          {clients.map((client) => (
            <option key={`legacy-${client.id}`} value={`legacy:${client.id}`}>
              {client.name}
            </option>
          ))}
        </select>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <FolderPlus className="h-4 w-4 text-primary" />
            Новый клиент
          </div>
          <div className="space-y-2">
            <Input
              value={clientDraft.name}
              onChange={(event) => setClientDraft({ ...clientDraft, name: event.target.value })}
              placeholder="Название клиента"
              className="h-10"
            />
            <Input
              value={clientDraft.description}
              onChange={(event) => setClientDraft({ ...clientDraft, description: event.target.value })}
              placeholder="Ниша или краткий контекст"
              className="h-10"
            />
            <textarea
              value={clientDraft.targetAudience}
              onChange={(event) => setClientDraft({ ...clientDraft, targetAudience: event.target.value })}
              placeholder="Целевая аудитория"
              className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <textarea
              value={clientDraft.brandVoice}
              onChange={(event) => setClientDraft({ ...clientDraft, brandVoice: event.target.value })}
              placeholder="Tone of voice"
              className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              onClick={() => void handleCreateClient()}
              disabled={!clientDraft.name.trim() || createProjectMutation.isPending}
              className="min-h-10 w-full"
            >
              <Plus className="h-4 w-4" />
              Создать клиента
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
