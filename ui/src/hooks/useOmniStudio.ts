import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  OmniClientAvatar,
  OmniGeneratedScript,
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

export type CreateOmniProjectPayload = {
  name: string;
  description?: string;
  targetAudience?: string;
  brandVoice?: string;
  legacyClientId?: number;
  telegramChatId?: string;
  telegramTopicId?: string;
};

export type UpdateOmniProjectProfilePayload = {
  projectId: number;
  name?: string;
  targetAudience?: string;
  brandVoice?: string;
};

export type CreateOmniProductPayload = {
  projectId: number;
  name: string;
  description?: string;
  productReferenceNotes?: string;
  avatarReferenceNotes?: string;
  targetDurationSeconds?: number;
  productRefs?: OmniProduct["product_refs"];
  avatarRefs?: unknown[];
};

export type UpdateOmniProductPayload = {
  projectId: number;
  productId: number;
  name?: string;
  description?: string;
  productReferenceNotes?: string;
  avatarReferenceNotes?: string;
  productRefs?: OmniProduct["product_refs"];
  avatarRefs?: OmniProduct["avatar_refs"];
};

export type UploadOmniProductImagesPayload = {
  projectId: number;
  files: File[];
};

export type DeleteOmniProductPayload = {
  projectId: number;
  productId: number;
};

export function useOmniProjects() {
  return useQuery<OmniProject[]>({
    queryKey: ["omni-projects"],
    queryFn: async () => (await axios.get(`${API_BASE}/projects`)).data,
    staleTime: 30_000,
  });
}

export function useOmniProducts(projectId: number | null) {
  return useQuery<OmniProduct[]>({
    queryKey: ["omni-products", projectId],
    queryFn: async () => (await axios.get(`${API_BASE}/products`, { params: { projectId } })).data,
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });
}

export function useCreateOmniProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateOmniProjectPayload) =>
      (await axios.post(`${API_BASE}/projects`, payload)).data as OmniProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["omni-projects"] }),
  });
}

export function useOmniGeneratedScripts(projectId: number | null, productId: number | null) {
  return useQuery<OmniGeneratedScript[]>({
    queryKey: ["omni-generated-scripts", projectId, productId],
    queryFn: async () =>
      (
        await axios.get(`${API_BASE}/generated-scripts`, {
          params: { projectId, productId: productId || undefined },
        })
      ).data,
    enabled: Boolean(projectId),
    staleTime: 20_000,
  });
}

export function useUpdateOmniProjectProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateOmniProjectProfilePayload) =>
      (await axios.patch(`${API_BASE}/projects`, payload)).data as OmniProject,
    onSuccess: (updatedProject) => {
      queryClient.setQueryData<OmniProject[]>(["omni-projects"], (projects) =>
        projects?.map((project) => (project.id === updatedProject.id ? updatedProject : project)) || projects
      );
      queryClient.invalidateQueries({ queryKey: ["omni-projects"] });
    },
  });
}

export function useCreateOmniProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateOmniProductPayload) =>
      (await axios.post(`${API_BASE}/products`, payload)).data as OmniProduct,
    onSuccess: (_, variables) => queryClient.invalidateQueries({ queryKey: ["omni-products", variables.projectId] }),
  });
}

export function useUpdateOmniProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateOmniProductPayload) =>
      (await axios.patch(`${API_BASE}/products`, payload)).data as OmniProduct,
    onSuccess: (updatedProduct, variables) => {
      queryClient.setQueryData<OmniProduct[]>(["omni-products", variables.projectId], (products) =>
        products?.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)) || products
      );
      queryClient.invalidateQueries({ queryKey: ["omni-products", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-generated-scripts", variables.projectId, variables.productId] });
    },
  });
}

export function useDeleteOmniProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DeleteOmniProductPayload) =>
      (await axios.delete(`${API_BASE}/products`, { params: payload })).data as { deleted: OmniProduct },
    onSuccess: (_, variables) => {
      queryClient.setQueryData<OmniProduct[]>(["omni-products", variables.projectId], (products) =>
        products?.filter((product) => product.id !== variables.productId) || products
      );
      queryClient.invalidateQueries({ queryKey: ["omni-products", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-generated-scripts", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-reels", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-legacy-library-links", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["omni-scenario-links", variables.projectId] });
    },
  });
}

export function useUploadOmniProductImages() {
  return useMutation({
    mutationFn: async (payload: UploadOmniProductImagesPayload) => {
      const formData = new FormData();
      formData.append("projectId", String(payload.projectId));
      payload.files.forEach((file) => formData.append("files", file));
      return (await axios.post(`${API_BASE}/product-images`, formData)).data as {
        refs: OmniProduct["product_refs"];
      };
    },
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

  const productsQuery = useOmniProducts(projectId);

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

  const activeLegacyClientIds = (libraryLinksQuery.data || [])
    .map((link) => link.legacy_client_id)
    .filter((id, index, ids) => ids.indexOf(id) === index);

  const legacyLibrariesQuery = useQuery<OmniLegacyLibrary[]>({
    queryKey: ["omni-legacy-libraries", legacySearch, activeLegacyClientIds.join(",")],
    queryFn: async () =>
      (
        await axios.get(`${API_BASE}/legacy-libraries`, {
          params: {
            q: legacySearch.trim() || undefined,
            limit: 40,
            includeClientIds: activeLegacyClientIds.length ? activeLegacyClientIds.join(",") : undefined,
          },
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

  const generatedScriptsQuery = useOmniGeneratedScripts(projectId, productId);

  const createProjectMutation = useCreateOmniProject();

  const createProductMutation = useCreateOmniProduct();

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

  const unlinkLibraryMutation = useMutation({
    mutationFn: async (payload: { projectId: number; productId?: number | null; legacyClientId: number }) =>
      (await axios.delete(`${API_BASE}/legacy-library-links`, { data: payload })).data as OmniLegacyLibraryLink | null,
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

  const createGeneratedScriptMutation = useMutation({
    mutationFn: async (payload: { projectId: number; productId: number }) =>
      (await axios.post(`${API_BASE}/generated-scripts`, payload)).data as OmniGeneratedScript,
    onSuccess: (_, variables) =>
      queryClient.invalidateQueries({
        queryKey: ["omni-generated-scripts", variables.projectId, variables.productId],
      }),
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
    generatedScriptsQuery,
    createProjectMutation,
    createProductMutation,
    createAvatarMutation,
    linkLibraryMutation,
    unlinkLibraryMutation,
    linkScenarioMutation,
    createReelMutation,
    createGeneratedScriptMutation,
  };
}
