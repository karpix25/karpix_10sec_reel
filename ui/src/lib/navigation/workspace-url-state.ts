import type { Screen } from "@/types";

const WORKSPACE_SCREENS = new Set<Screen>(["dashboard", "omni", "references", "settings"]);

export type WorkspaceUrlState = {
  screen: Screen;
  projectId: number | null;
  productId: number | null;
};

function parsePositiveInt(value: string | null) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function readWorkspaceUrlState(search: string): WorkspaceUrlState {
  const params = new URLSearchParams(search);
  const screenParam = params.get("screen") as Screen | null;

  return {
    screen: screenParam && WORKSPACE_SCREENS.has(screenParam) ? screenParam : "dashboard",
    projectId: parsePositiveInt(params.get("project")),
    productId: parsePositiveInt(params.get("product")),
  };
}

export function readInitialWorkspaceUrlState(): WorkspaceUrlState {
  if (typeof window === "undefined") {
    return { screen: "dashboard", projectId: null, productId: null };
  }

  return readWorkspaceUrlState(window.location.search);
}

export function buildWorkspaceUrl(
  currentHref: string,
  state: WorkspaceUrlState
) {
  const url = new URL(currentHref);
  url.searchParams.set("screen", state.screen);

  if (state.projectId) {
    url.searchParams.set("project", String(state.projectId));
  } else {
    url.searchParams.delete("project");
  }

  if (state.productId) {
    url.searchParams.set("product", String(state.productId));
  } else {
    url.searchParams.delete("product");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
