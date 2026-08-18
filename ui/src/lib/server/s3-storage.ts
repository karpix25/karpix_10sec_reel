import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  forcePathStyle: boolean;
};

export function getS3Config(): S3Config {
  return {
    endpoint: process.env.S3_ENDPOINT || "",
    region: process.env.S3_REGION || "us-east-1",
    bucket: process.env.S3_BUCKET || process.env.S3_BUCKET_NAME || "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || "",
    forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || "true").toLowerCase() === "true",
  };
}

export function isS3Configured(config: S3Config) {
  return Boolean(config.endpoint && config.bucket && config.accessKeyId && config.secretAccessKey);
}

function createS3Client(config: S3Config) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function encodeS3Key(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function buildS3ObjectUrl(config: S3Config, key: string) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/$/, "")}/${encodeS3Key(key)}`;
  }

  const endpoint = new URL(config.endpoint);
  const base = config.forcePathStyle
    ? `${endpoint.origin}/${config.bucket}`
    : `${endpoint.protocol}//${config.bucket}.${endpoint.host}`;
  return `${base}/${encodeS3Key(key)}`;
}

function getStoredObjectKey(config: S3Config, sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    const endpoint = new URL(config.endpoint);
    const path = decodeURIComponent(parsed.pathname);
    if (config.forcePathStyle && parsed.host === endpoint.host) {
      const prefix = `/${config.bucket}/`;
      return path.startsWith(prefix) ? path.slice(prefix.length) : null;
    }
    if (!config.forcePathStyle && parsed.host === `${config.bucket}.${endpoint.host}`) {
      return path.replace(/^\//, "");
    }
    return null;
  } catch {
    return null;
  }
}

export async function getReadableS3Url(sourceUrl: string | null | undefined, expiresSeconds = 3600) {
  if (!sourceUrl) return null;
  const config = getS3Config();
  if (!isS3Configured(config)) return sourceUrl;

  const key = getStoredObjectKey(config, sourceUrl);
  if (!key) return sourceUrl;

  return getSignedUrl(
    createS3Client(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: expiresSeconds }
  );
}

export async function putObjectToS3(config: S3Config, key: string, body: Buffer, contentType: string) {
  if (!isS3Configured(config)) {
    throw new Error("S3 is not configured.");
  }

  await createS3Client(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return buildS3ObjectUrl(config, key);
}
