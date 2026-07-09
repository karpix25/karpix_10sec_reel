import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  OmniClientAvatar,
  OmniLegacyScenario,
  OmniLegacyLibrary,
  OmniLegacyLibraryLink,
  OmniLegacyScenarioLink,
  OmniProduct,
  OmniProject,
  OmniReel,
  OmniReelSegment,
} from "@/lib/omni/types";

type ReelsPayload = {
  reels: OmniReel[];
  segments: OmniReelSegment[];
};

const API_BASE = "/api/omni";

export function useOmniProjects() {
  return useQuery<OmniProject[]>({
    queryKey: ["omni-projects"],
    queryFn: async () => (await axios.get(`${API_BASE}/projects`)).data,
    staleTime: 30_000,
  });
}

export function useOmniStudio(
  projectId: number | null,
  productId: number | null,
  legacySearch: string,
  legacyClientId?: number | null
) {
  const queryClient = useQueryClient();

  const projectsQuery = useOmniProjects();

  const productsQuery = useQuery<OmniProduct[]>({
    queryKey: ["omni-products", projectId],
    queryFn: async () => (await axios.get(`${API_BASE}/products`, { params: { projectId } })).data,
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const legacyScenariosQuery = useQuery<{ data: OmniLegacyScenario[]; totalCount: number }>({
    queryKey: ["omni-legacy-scenarios", legacySearch, legacyClientId],
    queryFn: async () =>
      (
        await axios.get(`${API_BASE}/legacy-scenarios`, {
          params: { q: legacySearch.trim() || undefined, clientId: legacyClientId || undefined, limit: 20 },
        })
      ).data,
    enabled: Boolean(legacyClientId),
    staleTime: 20_000,
  });

  const legacyLibrariesQuery = useQuery<OmniLegacyLibrary[]>({
    queryKey: ["omni-legacy-libraries", legacySearch],
    queryFn: async () =>
      (
        await axios.get(`${API_BASE}/legacy-libraries`, {
          params: { q: legacySearch.trim() || undefined, limit: 40 },
        })
      ).data,
    staleTime: 60_000,
  });

  const scenarioLinksQuery = useQuery<OmniLegacyScenarioLink[]>({
    queryKey: ["omni-scenario-links", projectId],
    queryFn: async () => (await axios.get(`${API_BASE}/scenario-links`, { params: { projectId } })).data,
    enabled: Boolean(projectId),
    staleTime: 20_000,
  });

  const libraryLinksQuery = useQuery<OmniLegacyLibraryLink[]>({
    queryKey: ["omni-legacy-library-links", projectId, productId],
    queryFn: async () =>
      (
        await axios.get(`${API_BASE}/legacy-library-links`, {
          params: { projectId, productId: productId || undefined },
        })
      ).data,
    enabled: Boolean(projectId),
    staleTime: 20_000,
  });

  const avatarsQuery = useQuery<OmniClientAvatar[]>({
    queryKey: ["omni-client-avatars", projectId],
    queryFn: async () => (await axios.get(`${API_BASE}/avatars`, { params: { projectId } })).data,
    enabled: Boolean(projectId),
    staleTime: 20_000,
  });

  const reelsQuery = useQuery<ReelsPayload>({
    queryKey: ["omni-reels", projectId, productId],
    queryFn: async () =>
      (
        await axios.get(`${API_BASE}/reels`, {
          params: { projectId, productId: productId || undefined },
        })
      ).data,
    enabled: Boolean(projectId),
    staleTime: 15_000,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string; telegramChatId?: string; telegramTopicId?: string }) =>
      (await axios.post(`${API_BASE}/projects`, payload)).data as OmniProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["omni-projects"] }),
  });

  const createProductMutation = useMutation({
    mutationFn: async (payload: {
      projectId: number;
      name: string;
      description?: string;
      productReferenceNotes?: string;
      avatarReferenceNotes?: string;
      targetDurationSeconds?: number;
      productRefs?: unknown[];
      avatarRefs?: unknown[];
    }) => (await axios.post(`${API_BASE}/products`, payload)).data as OmniProduct,
    onSuccess: (_, variables) => queryClient.invalidateQueries({ queryKey: ["omni-products", variables.projectId] }),
  });

  const createAvatarMutation = useMutation({
    mutationFn: async (payload: { projectId: number; prompt: string; referenceUrl?: string }) =>
      (await axios.post(`${API_BASE}/avatars`, payload)).data as OmniClientAvatar,
    onSuccess: (_, variables) => queryClient.invalidateQueries({ queryKey: ["omni-client-avatars", variables.projectId] }),
  });

  const linkLibraryMutation = useMutation({
    mutationFn: async (payload: { projectId: number; productId?: number | null; legacyClientId: number }) =>
      (await axios.post(`${API_BASE}/legacy-library-links`, payload)).data as OmniLegacyLibraryLink,
    onSuccess: (_, variables) =>
      queryClient.invalidateQueries({ queryKey: ["omni-legacy-library-links", variables.projectId] }),
  });

  const linkScenarioMutation = useMutation({
    mutationFn: async (payload: { projectId: number; productId?: number | null; legacyScenarioId: number }) =>
      (await axios.post(`${API_BASE}/scenario-links`, payload)).data as OmniLegacyScenarioLink,
    onSuccess: (_, variables) => queryClient.invalidateQueries({ queryKey: ["omni-scenario-links", variables.projectId] }),
  });

  const createReelMutation = useMutation({
    mutationFn: async (payload: {
      projectId: number;
      productId: number;
      sourceLegacyScenarioId?: number | null;
      targetDurationSeconds: number;
      brief?: string;
    }) => (await axios.post(`${API_BASE}/reels`, payload)).data as OmniReel,
    onSuccess: (_, variables) => queryClient.invalidateQueries({ queryKey: ["omni-reels", variables.projectId] }),
  });

  return {
    projectsQuery,
    productsQuery,
    avatarsQuery,
    legacyLibrariesQuery,
    legacyScenariosQuery,
    libraryLinksQuery,
    scenarioLinksQuery,
    reelsQuery,
    createProjectMutation,
    createProductMutation,
    createAvatarMutation,
    linkLibraryMutation,
    linkScenarioMutation,
    createReelMutation,
  };
}
