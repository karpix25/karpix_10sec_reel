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
  const selected = selectUrlReferenceImage(images, segmentIndex);
  if (!selected) return { sent: [], skipped: [] as ReelReferenceImage[] };

  return {
    sent: [selected],
    skipped: images.filter((image) => image !== selected),
  };
}

function selectUrlReferenceImage(images: ReelReferenceImage[], segmentIndex?: number) {
  if (segmentIndex === 1) {
    return (
      images.find((image) => image.role === "avatar") ||
      images.find((image) => image.role === "avatar_product_composite") ||
      images.find((image) => image.role === "product") ||
      images[0]
    );
  }

  return (
    images.find((image) => image.role === "avatar_product_composite") ||
    images.find((image) => image.role === "avatar") ||
    images.find((image) => image.role === "product") ||
    images[0]
  );
}
