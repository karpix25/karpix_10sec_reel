import type { OmniStoryboardFrame, OmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-types";
import { isProductVisibleInStoryboardFrame } from "../omni-intro-product-contract";

/** Render approved visual instructions only; source observations never override this timeline. */
export function renderOmniStoryboardTimeline(storyboard: OmniStoryboardSegment, productName: string) {
  const frameSeconds = storyboard.durationSeconds / storyboard.frames.length;
  let previousPresenterWardrobe: string | undefined;
  return [
    `Утверждённый план на ${storyboard.durationSeconds} секунд. Панели задают последовательные состояния; новая панель сама по себе не требует склейки или паузы в речи.`,
    ...storyboard.frames.map((frame, index) => {
      const productVisible = isProductVisibleInStoryboardFrame(frame, productName);
      const speechMode = productVisible ? "voiceover_only" : frame.speechMode || frame.physicalPlan?.speechMode || "on_camera";
      const role = productVisible ? "товарный B-roll" : speechMode === "on_camera" ? "говорящий аватар" : "тематический B-roll";
      const details = renderFrameDetails(frame, storyboard.frames[index - 1], speechMode === "on_camera", previousPresenterWardrobe);
      if (speechMode === "on_camera") previousPresenterWardrobe = frame.wardrobe;
      return [
        `[${formatTime(index * frameSeconds)}-${formatTime((index + 1) * frameSeconds)}s] Панель ${index + 1}: ${role}.`,
        speechMode === "on_camera"
          ? "Аватар продолжает речь с синхронной артикуляцией."
          : "Та же речь продолжается за кадром.",
        ...details,
        frame.effectNotes ? `Переход: ${frame.effectNotes}` : "",
      ].filter(Boolean).join(" ");
    }),
    "На монтажной склейке меняется кадр, голос продолжается. Внутри непрерывного плана сохраняются опора, форма, масштаб и положение предметов; движение следует только описанному действию и камере.",
  ].join("\n");
}

function renderFrameDetails(frame: OmniStoryboardFrame, previous: OmniStoryboardFrame | undefined, presenter: boolean, previousPresenterWardrobe: string | undefined) {
  const fields: [string, string, string | undefined][] = [
    ["Действие", frame.visualAction, previous?.visualAction],
    ["Камера", frame.camera, previous?.camera],
    ["Окружение и свет", frame.environment, previous?.environment],
    ["Предметы", frame.productPlacement, previous?.productPlacement],
  ];
  if (presenter) fields.push(["Одежда", frame.wardrobe, previousPresenterWardrobe]);
  const unchanged: string[] = [];
  const details = fields.flatMap(([label, value, prior]) => {
    if (value !== prior) return [`${label}: ${value}`];
    unchanged.push(label.toLocaleLowerCase("ru"));
    return [];
  });
  if (unchanged.length) details.push(`Сохраняются: ${unchanged.join(", ")}.`);
  return details;
}

function formatTime(seconds: number) {
  return String(Math.round(seconds * 100) / 100);
}
