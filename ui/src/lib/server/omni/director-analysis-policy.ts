export type DirectorAnalysisSource = {
  reels_url?: string | null;
};

export function shouldAnalyzeDirectorReference(source: DirectorAnalysisSource) {
  return Boolean(typeof source.reels_url === "string" && source.reels_url.trim());
}
