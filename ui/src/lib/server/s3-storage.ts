import crypto from "crypto";

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

function buildS3ObjectUrl(config: S3Config, key: string) {
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  const endpoint = new URL(config.endpoint);
  const base = config.forcePathStyle
    ? `${endpoint.origin}/${config.bucket}`
    : `${endpoint.protocol}//${config.bucket}.${endpoint.host}`;
  return `${base}/${key}`;
}

function sha256Hex(data: Buffer | string) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function getAmzDates(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

export async function putObjectToS3(config: S3Config, key: string, body: Buffer, contentType: string) {
  if (!isS3Configured(config)) {
    throw new Error("S3 is not configured.");
  }

  const endpoint = new URL(config.endpoint);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const host = config.forcePathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
  const canonicalUri = config.forcePathStyle ? `/${config.bucket}/${encodedKey}` : `/${encodedKey}`;
  const payloadHash = sha256Hex(body);
  const requestBody = new Uint8Array(body);
  const { amzDate, dateStamp } = getAmzDates();
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const uploadUrl = config.forcePathStyle
    ? `${endpoint.origin}${canonicalUri}`
    : `${endpoint.protocol}//${host}${canonicalUri}`;
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`S3 upload failed: ${response.status} ${message}`);
  }

  return buildS3ObjectUrl(config, encodedKey);
}
