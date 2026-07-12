import sharp from "sharp";
import { getS3Config, putObjectToS3 } from "@/lib/server/s3-storage";

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 1280;
const PADDING = 32;
const GAP = 28;
const AVATAR_HEIGHT = 760;
const PRODUCT_HEIGHT = CANVAS_HEIGHT - PADDING * 2 - GAP - AVATAR_HEIGHT;
const PANEL_WIDTH = CANVAS_WIDTH - PADDING * 2;

type CompositeReferenceInput = {
  projectId: number;
  reelId: number;
  avatarUrl: string;
  productUrl: string;
};

export async function createOmniCompositeReference(input: CompositeReferenceInput) {
  const [avatar, product] = await Promise.all([
    downloadImage(input.avatarUrl, "avatar"),
    downloadImage(input.productUrl, "product"),
  ]);

  const avatarImage = await fitImage(avatar, PANEL_WIDTH, AVATAR_HEIGHT);
  const productImage = await fitImage(product, PANEL_WIDTH, PRODUCT_HEIGHT);
  const background = Buffer.from(`
    <svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="#f4f0ea"/>
      <rect x="${PADDING}" y="${PADDING}" width="${PANEL_WIDTH}" height="${AVATAR_HEIGHT}" rx="28" fill="#ffffff"/>
      <rect x="${PADDING}" y="${PADDING + AVATAR_HEIGHT + GAP}" width="${PANEL_WIDTH}" height="${PRODUCT_HEIGHT}" rx="28" fill="#ffffff"/>
    </svg>
  `);

  const body = await sharp(background)
    .composite([
      { input: avatarImage, left: PADDING, top: PADDING },
      { input: productImage, left: PADDING, top: PADDING + AVATAR_HEIGHT + GAP },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  const key = `omni-composite-references/project-${input.projectId}/reel-${input.reelId}/${Date.now()}_avatar_product_9x16.jpg`;
  return putObjectToS3(getS3Config(), key, body, "image/jpeg");
}

async function downloadImage(url: string, label: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to download ${label} reference image: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`${label} reference is not an image: ${contentType || "unknown content type"}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function fitImage(input: Buffer, width: number, height: number) {
  return sharp(input)
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      withoutEnlargement: false,
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
