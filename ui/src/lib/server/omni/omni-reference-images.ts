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
  void segmentIndex;
  if (transport !== "url") return { sent: images, skipped: [] as ReelReferenceImage[] };
  const selected =
    images.find((image) => image.role === "avatar_product_composite") ||
    images.find((image) => image.role === "avatar") ||
    images[0];
  if (!selected) return { sent: [], skipped: [] as ReelReferenceImage[] };

  return {
    sent: [selected],
    skipped: images.filter((image) => image !== selected),
  };
}
