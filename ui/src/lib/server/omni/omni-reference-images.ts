export type ReelReferenceImage = {
  url: string;
  fieldName: string;
  role: string;
};

export type ReferenceImageSelection = {
  sent: ReelReferenceImage[];
  skipped: ReelReferenceImage[];
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

export function selectReferenceImagesForSegment(input: {
  provider: "cometapi" | "kie-ai";
  continuityImages: ReelReferenceImage[];
  cometReferenceImages: ReelReferenceImage[];
  kieReferenceImages: ReelReferenceImage[];
  referenceImageTransport: string;
  segmentIndex: number;
  productIsVisible: boolean;
}): ReferenceImageSelection {
  if (input.provider === "kie-ai") {
    return {
      sent: uniqueReferenceImages([...input.continuityImages, ...input.kieReferenceImages]),
      skipped: [],
    };
  }

  const visibleCometReferences = input.productIsVisible
    ? input.cometReferenceImages
    : input.cometReferenceImages.filter((image) => image.role === "avatar");
  const hiddenCometReferences = input.productIsVisible
    ? []
    : input.cometReferenceImages.filter((image) => image.role !== "avatar");
  const cometSelection = selectReferenceImagesForComet(
    [...input.continuityImages, ...visibleCometReferences],
    input.referenceImageTransport,
    input.segmentIndex
  );

  return {
    ...cometSelection,
    skipped: [...cometSelection.skipped, ...hiddenCometReferences],
  };
}

function selectUrlReferenceImage(images: ReelReferenceImage[], segmentIndex?: number) {
  if (typeof segmentIndex === "number" && segmentIndex > 1) {
    const previousFrame = images.find((image) => image.role === "previous_last_frame");
    if (previousFrame) return previousFrame;
  }

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

function uniqueReferenceImages(images: ReelReferenceImage[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    const key = `${image.role}:${image.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
