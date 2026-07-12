export type ReelReferenceImage = {
  url: string;
  fieldName: string;
  role: string;
};

export function selectReferenceImagesForComet(images: ReelReferenceImage[], transport: string) {
  if (transport !== "url") return { sent: images, skipped: [] as ReelReferenceImage[] };
  return {
    sent: images.slice(0, 1),
    skipped: images.slice(1),
  };
}
