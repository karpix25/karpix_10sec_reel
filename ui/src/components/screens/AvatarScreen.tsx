"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, ImagePlus, Link, Sparkles, UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AvatarPreviewPanel } from "@/components/screens/AvatarPreviewPanel";
import { AvatarWardrobeSourceControl } from "@/components/screens/AvatarWardrobeSourceControl";
import {
  useApproveOmniAvatar,
  useCreateOmniAvatar,
  useCreateOmniProject,
  useDeleteOmniAvatar,
  useOmniClientAvatars,
  useOmniProjects,
  useRenameOmniAvatar,
  useSetOmniAvatarActive,
  useUpdateOmniProjectProfile,
  useUploadOmniAvatarReference,
} from "@/hooks/useOmniStudio";
import { getDefaultAvatarPrompt } from "@/lib/omni/avatar-prompts";
import {
  findClientWorkspaceProject,
  getClientWorkspaceDescription,
  getLatestAvatar,
} from "@/lib/omni/workspace";
import type { OmniClientAvatar, OmniProject } from "@/lib/omni/types";
import type { OmniWardrobeSource } from "@/lib/omni/wardrobe-source";
import type { Client } from "@/types";

type AvatarScreenProps = {
  selectedClient: Client | null;
  selectedProjectId: number | null;
  onSelectProject: (projectId: number | null) => void;
};

export function AvatarScreen({ selectedClient, selectedProjectId, onSelectProject }: AvatarScreenProps) {
  const [displayName, setDisplayName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");

  const projectsQuery = useOmniProjects();
  const createProjectMutation = useCreateOmniProject();
  const createAvatarMutation = useCreateOmniAvatar();
  const approveAvatarMutation = useApproveOmniAvatar();
  const deleteAvatarMutation = useDeleteOmniAvatar();
  const renameAvatarMutation = useRenameOmniAvatar();
  const setAvatarActiveMutation = useSetOmniAvatarActive();
  const updateProjectMutation = useUpdateOmniProjectProfile();
  const uploadAvatarReferenceMutation = useUploadOmniAvatarReference();

  const projects = useMemo(() => projectsQuery.data || [], [projectsQuery.data]);
  const inferredProject = useMemo(
    () => findClientWorkspaceProject(projects, selectedClient),
    [projects, selectedClient]
  );
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;
  const activeProject = selectedProject || inferredProject;
  const activeProjectId = activeProject?.id || null;
  const avatarsQuery = useOmniClientAvatars(activeProjectId);
  const avatars = avatarsQuery.data || [];
  const latestAvatar = getLatestAvatar(avatars);
  const defaultPrompt = getDefaultAvatarPrompt(activeProject?.name || selectedClient?.name);
  const isBusy =
    createAvatarMutation.isPending ||
    uploadAvatarReferenceMutation.isPending ||
    approveAvatarMutation.isPending ||
    deleteAvatarMutation.isPending ||
    renameAvatarMutation.isPending ||
    setAvatarActiveMutation.isPending;

  useEffect(() => {
    if (!prompt.trim() && defaultPrompt) {
      setPrompt(defaultPrompt);
    }
  }, [defaultPrompt, prompt]);

  const handleCreateWorkspace = () => {
    if (!selectedClient) return;
    createProjectMutation.mutate(
      {
        name: selectedClient.name,
        description: getClientWorkspaceDescription(selectedClient),
        targetAudience: selectedClient.target_audience || undefined,
        brandVoice: selectedClient.brand_voice || undefined,
        legacyClientId: selectedClient.id,
      },
      {
        onSuccess: (project: OmniProject) => onSelectProject(project.id),
      }
    );
  };

  const handleUploadReference = async (file: File | null) => {
    if (!activeProjectId || !file) return;
    const result = await uploadAvatarReferenceMutation.mutateAsync({ projectId: activeProjectId, file });
    setReferenceUrl(result.ref.url);
  };

  const handleCreateAvatar = () => {
    if (!activeProjectId || !prompt.trim()) return;
    createAvatarMutation.mutate(
      {
        projectId: activeProjectId,
        displayName: displayName.trim() || undefined,
        prompt: prompt.trim(),
        referenceUrl: referenceUrl.trim() || undefined,
      },
      {
        onSuccess: () => {
          setDisplayName("");
          setReferenceUrl("");
        },
      }
    );
  };

  const handleRetryAvatar = (avatar?: OmniClientAvatar) => {
    const retryPrompt = avatar?.prompt || latestAvatar?.prompt || defaultPrompt || prompt;
    if (!retryPrompt.trim()) return;
    setPrompt(retryPrompt);
    if (!activeProjectId) return;
    createAvatarMutation.mutate({
      projectId: activeProjectId,
      displayName: avatar?.display_name ? `${avatar.display_name} copy` : undefined,
      prompt: retryPrompt.trim(),
    });
  };

  const handleRenameAvatar = (avatar: OmniClientAvatar, nextName: string) => {
    if (!activeProjectId) return;
    renameAvatarMutation.mutate({
      projectId: activeProjectId,
      avatarId: avatar.id,
      displayName: nextName,
    });
  };

  const handleApproveAvatar = (avatar?: OmniClientAvatar) => {
    const targetAvatar = avatar || latestAvatar;
    if (!activeProjectId || !targetAvatar) return;
    approveAvatarMutation.mutate({ projectId: activeProjectId, avatarId: targetAvatar.id });
  };

  const handleDeleteAvatar = (avatar?: OmniClientAvatar) => {
    const targetAvatar = avatar || latestAvatar;
    if (!activeProjectId || !targetAvatar) return;
    deleteAvatarMutation.mutate({ projectId: activeProjectId, avatarId: targetAvatar.id });
  };

  const handleToggleAvatarActive = (avatar: OmniClientAvatar) => {
    if (!activeProjectId) return;
    setAvatarActiveMutation.mutate({
      projectId: activeProjectId,
      avatarId: avatar.id,
      isActive: !avatar.is_active,
    });
  };

  const handleWardrobeSourceChange = (wardrobeSource: OmniWardrobeSource) => {
    if (!activeProjectId || activeProject?.wardrobe_source === wardrobeSource) return;
    updateProjectMutation.mutate({ projectId: activeProjectId, wardrobeSource });
  };

  if (!activeProject && !selectedClient) {
    return (
      <div className="mx-auto max-w-[94rem] rounded-lg border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Аватар бренда</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Выберите бренд слева</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Аватар привязывается к бренду и затем используется в Omni-видео как единый персонаж.
        </p>
      </div>
    );
  }

  if (!activeProject && selectedClient) {
    return (
      <div className="mx-auto max-w-[94rem] rounded-lg border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Аватар бренда</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{selectedClient.name}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Для аватара нужен Omni-проект бренда. Создам связку один раз, дальше здесь будут промпт, загрузка
          референса и текущий аватар.
        </p>
        <button
          type="button"
          onClick={handleCreateWorkspace}
          disabled={createProjectMutation.isPending}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {createProjectMutation.isPending ? "Создаю..." : "Создать Omni-проект"}
        </button>
      </div>
    );
  }

  if (!activeProject) {
    return null;
  }

  return (
    <div className="mx-auto max-w-[94rem] space-y-5">
      <header className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Bot className="h-3.5 w-3.5" />
            gpt-image-2
          </Badge>
          <Badge variant={latestAvatar ? "default" : "outline"}>
            {latestAvatar ? "аватар готов" : "аватар не создан"}
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Аватар для {activeProject.name}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Здесь создаётся визуальный персонаж бренда. Можно сгенерировать с нуля по промпту или добавить фото/URL как
          референс для более стабильного образа.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Создать аватар</p>
          <label className="mt-4 block text-sm font-semibold text-foreground" htmlFor="avatar-name">
            Имя аватара
          </label>
          <input
            id="avatar-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
            placeholder="Например: Европейская дома"
          />
          <label className="mt-4 block text-sm font-semibold text-foreground" htmlFor="avatar-prompt">
            Промпт образа
          </label>
          <textarea
            id="avatar-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={7}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-6 outline-none transition focus:border-primary"
            placeholder={defaultPrompt || "Например: уверенная женщина-эксперт 35 лет, натуральный свет, чистый фон, живое выражение лица, выглядит как ведущая коротких экспертных reels..."}
          />

          <AvatarWardrobeSourceControl
            project={activeProject}
            isSaving={updateProjectMutation.isPending}
            onChange={handleWardrobeSourceChange}
          />

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <label className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm">
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <UploadCloud className="h-4 w-4 text-primary" />
                Загрузить референс
              </span>
              <input
                type="file"
                accept="image/*"
                className="mt-3 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground"
                onChange={(event) => handleUploadReference(event.target.files?.[0] || null)}
                disabled={!activeProjectId || isBusy}
              />
            </label>

            <label className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <Link className="h-4 w-4 text-primary" />
                URL референса
              </span>
              <input
                value={referenceUrl}
                onChange={(event) => setReferenceUrl(event.target.value)}
                className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                placeholder="https://..."
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleCreateAvatar}
            disabled={!prompt.trim() || !activeProjectId || isBusy}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ImagePlus className="h-4 w-4" />
            {createAvatarMutation.isPending ? "Генерирую через GPT Image 2..." : "Создать через GPT Image 2"}
          </button>
        </section>

        <AvatarPreviewPanel
          avatars={avatars}
          selectedAvatar={latestAvatar}
          isBusy={isBusy}
          onApprove={handleApproveAvatar}
          onRetry={handleRetryAvatar}
          onDelete={handleDeleteAvatar}
          onRename={handleRenameAvatar}
          onToggleActive={handleToggleAvatarActive}
        />
      </div>
    </div>
  );
}
