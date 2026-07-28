import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type { OmniAvatarSpeechGender } from "@/lib/omni/avatar-speech-gender";
import type { OmniClientAvatar, OmniProduct } from "@/lib/omni/types";

const API_BASE = "/api/omni";

export type UploadOmniAvatarReferencePayload = {
  projectId: number;
  file: File;
};

export function useUploadOmniAvatarReference() {
  return useMutation({
    mutationFn: async (payload: UploadOmniAvatarReferencePayload) => {
      const formData = new FormData();
      formData.append("projectId", String(payload.projectId));
      formData.append("file", payload.file);
      return (await axios.post(`${API_BASE}/avatar-reference`, formData)).data as {
        ref: OmniProduct["avatar_refs"][number];
      };
    },
  });
}

export function useOmniClientAvatars(projectId: number | null) {
  return useQuery<OmniClientAvatar[]>({
    queryKey: ["omni-client-avatars", projectId],
    queryFn: async () => (await axios.get(`${API_BASE}/avatars`, { params: { projectId } })).data,
    enabled: Boolean(projectId),
    staleTime: 20_000,
  });
}

export function useCreateOmniAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      projectId: number;
      prompt: string;
      speechGender: OmniAvatarSpeechGender;
      displayName?: string;
      referenceUrl?: string;
    }) => (await axios.post(`${API_BASE}/avatars`, payload)).data as OmniClientAvatar,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["omni-client-avatars", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-generated-script-prompts"] });
    },
  });
}

export function useRenameOmniAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { projectId: number; avatarId: number; displayName: string }) =>
      (await axios.patch(`${API_BASE}/avatars`, payload)).data as OmniClientAvatar,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["omni-client-avatars", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-generated-script-prompts"] });
    },
  });
}

export function useUpdateOmniAvatarSpeechGender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      projectId: number;
      avatarId: number;
      speechGender: OmniAvatarSpeechGender;
    }) => (await axios.patch(`${API_BASE}/avatars`, payload)).data as OmniClientAvatar,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["omni-client-avatars", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-generated-script-prompts"] });
    },
  });
}

export function useApproveOmniAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { projectId: number; avatarId: number }) =>
      (await axios.patch(`${API_BASE}/avatars`, { ...payload, status: "approved" })).data as OmniClientAvatar,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["omni-client-avatars", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-generated-script-prompts"] });
    },
  });
}

export function useSetOmniAvatarActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { projectId: number; avatarId: number; isActive: boolean }) =>
      (await axios.patch(`${API_BASE}/avatars`, payload)).data as OmniClientAvatar,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["omni-client-avatars", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-generated-script-prompts"] });
    },
  });
}

export function useDeleteOmniAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { projectId: number; avatarId: number }) =>
      (await axios.delete(`${API_BASE}/avatars`, { params: payload })).data as { ok: true },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["omni-client-avatars", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-generated-script-prompts"] });
    },
  });
}
