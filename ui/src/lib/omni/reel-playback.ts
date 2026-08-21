export function getOmniReelPlaybackUrl(reelId: number, hasSubtitles = false) {
  const variant = hasSubtitles ? "?variant=subtitled" : "";
  return `/api/omni/reels/${reelId}/video${variant}`;
}
