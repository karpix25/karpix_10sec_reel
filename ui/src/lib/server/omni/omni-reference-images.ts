export type ReelReferenceImage = {
  url: string;
  fieldName: string;
  role: string;
};

export function selectReferenceImagesForComet(
  images: ReelReferenceImage[],
  transport: string,
  _segmentIndex?: number
) {
  if (transport !== "url") return { sent: images, skipped: [] as ReelReferenceImage[] };
  const selected = images.find((image) => image.role === "avatar") || images[0];
  if (!selected) return { sent: [], skipped: [] as ReelReferenceImage[] };

  return {
    sent: [selected],
    skipped: images.filter((image) => image !== selected),
  };
}
