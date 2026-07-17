import type { OmniReel } from "./types";

const ACTIVE_SUBTITLE_STATUSES = new Set(["queued", "transcribing", "rendering"]);

export function isActiveOmniSubtitleStatus(status: OmniReel["subtitles_status"]) {
  return ACTIVE_SUBTITLE_STATUSES.has(String(status || "").toLowerCase());
}

export function getOmniSubtitleStatusLabel(status: OmniReel["subtitles_status"]) {
  if (status === "queued") return "в очереди";
  if (status === "transcribing") return "транскрибация";
  if (status === "rendering") return "рендер";
  if (status === "completed") return "готово";
  if (status === "failed") return "ошибка";
  return "не запускались";
}

export function getOmniReelSubtitleCue(reel: OmniReel) {
  if (reel.subtitled_video_url) return "Субтитры наложены";
  if (isActiveOmniSubtitleStatus(reel.subtitles_status)) {
    return `Субтитры: ${getOmniSubtitleStatusLabel(reel.subtitles_status)}`;
  }
  if (reel.subtitles_status === "failed") return "Субтитры: ошибка";
  return null;
}
