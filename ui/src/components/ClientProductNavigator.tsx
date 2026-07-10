"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateOmniProject, useOmniProjects } from "@/hooks/useOmniStudio";

type NavigatorProps = {
  selectedProjectId: number | null;
  onClearLegacyClientSelection: () => void;
  onSelectProjectId: (id: number | null) => void;
  onSelectProductId: (id: number | null) => void;
  onOpenOmni: () => void;
};

export function ClientProductNavigator({
  selectedProjectId,
  onClearLegacyClientSelection,
  onSelectProjectId,
  onSelectProductId,
  onOpenOmni,
}: NavigatorProps) {
  const [clientName, setClientName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const projectsQuery = useOmniProjects();
  const createProjectMutation = useCreateOmniProject();
  const projects = useMemo(() => projectsQuery.data || [], [projectsQuery.data]);
  const clientSelectValue = selectedProjectId ? String(selectedProjectId) : "";

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
    onClearLegacyClientSelection();
    onOpenOmni();

    if (!value) {
      onSelectProjectId(null);
      return;
    }

    onSelectProjectId(Number(value));
  };

  const handleCreateClient = async () => {
    const name = clientName.trim();
    if (!name) return;

    const project = await createProjectMutation.mutateAsync({ name });
    onClearLegacyClientSelection();
    onSelectProjectId(project.id);
    onSelectProductId(null);
    setClientName("");
    setIsCreateOpen(false);
    onOpenOmni();
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Клиент</p>

        <select
          value={clientSelectValue}
          onChange={(event) => handleSelectClient(event.target.value)}
          disabled={projectsQuery.isLoading}
          className="h-12 w-full rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">{projects.length ? "Выберите клиента" : "Клиенты еще не созданы"}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant="outline"
          onClick={() => setIsCreateOpen((value) => !value)}
          className="min-h-11 w-full justify-center"
        >
          <FolderPlus className="h-4 w-4" />
          Добавить клиента
        </Button>

        {isCreateOpen ? (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderPlus className="h-4 w-4 text-primary" />
              Новый клиент
            </div>
            <div className="space-y-2">
              <Input
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                placeholder="Название клиента"
                className="h-10"
              />
              <Button
                type="button"
                onClick={() => void handleCreateClient()}
                disabled={!clientName.trim() || createProjectMutation.isPending}
                className="min-h-10 w-full"
              >
                <Plus className="h-4 w-4" />
                Создать клиента
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
