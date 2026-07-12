export type ReelReferenceImage = {
  url: string;
  fieldName: string;
  role: string;
};

export function selectReferenceImagesForComet(
  images: ReelReferenceImage[],
  transport: string,
  segmentIndex?: number
) {
  if (transport !== "url") return { sent: images, skipped: [] as ReelReferenceImage[] };
  const preferredRole = segmentIndex && segmentIndex > 1 ? "product" : "avatar";
  const selected = images.find((image) => image.role === preferredRole) || images[0];
  if (!selected) return { sent: [], skipped: [] as ReelReferenceImage[] };

  return {
    sent: [selected],
    skipped: images.filter((image) => image !== selected),
  };
}
