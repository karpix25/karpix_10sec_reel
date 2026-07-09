import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  OmniLegacyScenario,
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

export function useOmniStudio(projectId: number | null, productId: number | null, legacySearch: string) {
  const queryClient = useQueryClient();

  const projectsQuery = useQuery<OmniProject[]>({
    queryKey: ["omni-projects"],
    queryFn: async () => (await axios.get(`${API_BASE}/projects`)).data,
    staleTime: 30_000,
  });

  const productsQuery = useQuery<OmniProduct[]>({
    queryKey: ["omni-products", projectId],
    queryFn: async () => (await axios.get(`${API_BASE}/products`, { params: { projectId } })).data,
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const legacyScenariosQuery = useQuery<{ data: OmniLegacyScenario[]; totalCount: number }>({
    queryKey: ["omni-legacy-scenarios", legacySearch],
    queryFn: async () =>
      (
        await axios.get(`${API_BASE}/legacy-scenarios`, {
          params: { q: legacySearch.trim() || undefined, limit: 20 },
        })
      ).data,
    staleTime: 20_000,
  });

  const scenarioLinksQuery = useQuery<OmniLegacyScenarioLink[]>({
    queryKey: ["omni-scenario-links", projectId],
    queryFn: async () => (await axios.get(`${API_BASE}/scenario-links`, { params: { projectId } })).data,
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
    }) => (await axios.post(`${API_BASE}/products`, payload)).data as OmniProduct,
    onSuccess: (_, variables) => queryClient.invalidateQueries({ queryKey: ["omni-products", variables.projectId] }),
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
    legacyScenariosQuery,
    scenarioLinksQuery,
    reelsQuery,
    createProjectMutation,
    createProductMutation,
    linkScenarioMutation,
    createReelMutation,
  };
}
