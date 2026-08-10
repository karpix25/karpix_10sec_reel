import sharp from "sharp";
import {
  uploadOmniGeneratedScriptStoryboardImageBufferToS3,
  uploadOmniImageBufferToS3,
} from "./omni-video-storage";

const WIDTH = 720;
const HEIGHT = 1280;
const PADDING = 24;
const GAP = 16;
const CONTENT_WIDTH = WIDTH - PADDING * 2;
const HERO_HEIGHT = 700;

export async function createOmniDeterministicStoryboardBoard(input: {
  projectId: number;
  reelId?: number;
  scriptId?: number;
  segmentIndex: number;
  avatarReferenceUrl: string;
  productReferenceUrls?: readonly string[];
  directorReferenceImageUrls?: readonly string[];
}) {
  const references = [
    { url: input.avatarReferenceUrl, kind: "avatar" as const },
    ...(input.productReferenceUrls || []).slice(0, 3).map((url) => ({ url, kind: "product" as const })),
    ...(input.directorReferenceImageUrls || []).slice(0, 3).map((url) => ({ url, kind: "director" as const })),
  ].filter((reference) => isHttpUrl(reference.url));
  if (!references.length) throw new Error("Deterministic storyboard requires at least one reference image");

  const loaded = await Promise.all(references.map(async (reference) => ({
    ...reference,
    body: await downloadImage(reference.url, reference.kind),
  })));
  const hero = loaded[0];
  const supporting = loaded.slice(1);
  const heroHeight = supporting.length ? HERO_HEIGHT : HEIGHT - PADDING * 2;
  const supportingTop = PADDING + heroHeight + GAP;
  const supportingHeight = HEIGHT - PADDING - supportingTop;
  const layout = supporting.length
    ? buildSupportingLayout(supporting.length, supportingTop, supportingHeight)
    : [];
  const background = buildBackground(heroHeight, layout);
  const composites = [
    { input: await fitImage(hero.body, CONTENT_WIDTH, heroHeight, hero.kind), left: PADDING, top: PADDING },
    ...await Promise.all(supporting.map(async (reference, index) => ({
      input: await fitImage(reference.body, layout[index].width, layout[index].height, reference.kind),
      left: layout[index].left,
      top: layout[index].top,
    }))),
  ];
  const body = await sharp(background)
    .composite(composites)
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  return uploadStoryboardBoard({
    projectId: input.projectId,
    reelId: input.reelId,
    scriptId: input.scriptId,
    segmentIndex: input.segmentIndex,
    body,
  });
}

async function downloadImage(url: string, kind: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Deterministic storyboard ${kind} reference failed: ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Deterministic storyboard ${kind} reference is not an image: ${contentType}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function buildSupportingLayout(count: number, top: number, height: number) {
  const columns = count === 1 ? 1 : 2;
  const rows = Math.ceil(count / columns);
  const width = columns === 1 ? CONTENT_WIDTH : (CONTENT_WIDTH - GAP) / columns;
  const cellHeight = (height - GAP * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => ({
    left: PADDING + (index % columns) * (width + GAP),
    top: top + Math.floor(index / columns) * (cellHeight + GAP),
    width,
    height: cellHeight,
  }));
}

function buildBackground(heroHeight: number, layout: readonly { left: number; top: number; width: number; height: number }[]) {
  const panels = [
    `<rect x="${PADDING}" y="${PADDING}" width="${CONTENT_WIDTH}" height="${heroHeight}" rx="24" fill="#ffffff"/>`,
    ...layout.map((cell) => `<rect x="${cell.left}" y="${cell.top}" width="${cell.width}" height="${cell.height}" rx="20" fill="#ffffff"/>`),
  ].join("");
  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#111111"/>
      ${panels}
    </svg>
  `);
}

async function fitImage(body: Buffer, width: number, height: number, kind: "avatar" | "product" | "director") {
  const image = kind === "director" ? sharp(body).blur(8).grayscale() : sharp(body);
  return image
    .resize(Math.round(width), Math.round(height), {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function uploadStoryboardBoard(input: {
  projectId: number;
  reelId?: number;
  scriptId?: number;
  segmentIndex: number;
  body: Buffer;
}) {
  const fileName = `storyboard_${String(input.segmentIndex).padStart(2, "0")}_reference_board.jpg`;
  if (typeof input.reelId === "number") {
    return uploadOmniImageBufferToS3({
      projectId: input.projectId,
      reelId: input.reelId,
      segmentIndex: input.segmentIndex,
      fileName,
      body: input.body,
      contentType: "image/jpeg",
    });
  }
  if (typeof input.scriptId === "number") {
    return uploadOmniGeneratedScriptStoryboardImageBufferToS3({
      projectId: input.projectId,
      scriptId: input.scriptId,
      segmentIndex: input.segmentIndex,
      fileName,
      body: input.body,
      contentType: "image/jpeg",
    });
  }
  throw new Error("Deterministic storyboard requires reelId or scriptId");
}

function isHttpUrl(value: string) {
  return /^https?:\/\//iu.test(value.trim());
}
