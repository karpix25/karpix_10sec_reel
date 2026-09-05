import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type { OmniGeneratedScript } from "@/lib/omni/types";
import { normalizeOmniApiError } from "./omniApiClient";

export function useEditGeneratedScript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: number; productId: number; scriptId: number; script: string }) => {
      try {
        return (await axios.patch<OmniGeneratedScript>(`/api/omni/generated-scripts/${input.scriptId}`, input)).data;
      } catch (error) { throw normalizeOmniApiError(error); }
    },
    onSuccess: (saved, input) => {
      queryClient.setQueryData<OmniGeneratedScript[]>(["omni-generated-scripts", input.projectId, input.productId], (scripts) =>
        scripts?.map((script) => script.id === saved.id ? { ...script, ...saved } : script));
      void queryClient.invalidateQueries({ queryKey: ["omni-generated-scripts", input.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["omni-generated-script-prompts"] });
    },
  });
}
