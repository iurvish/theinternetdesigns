import { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/lib/env";

let cached: S3Client | null = null;

export function r2Client() {
  if (cached) return cached;
  const env = serverEnv();
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error("[r2] Missing R2 credentials");
  }
  cached = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return cached;
}

export function r2Bucket() {
  const bucket = serverEnv().R2_BUCKET;
  if (!bucket) throw new Error("[r2] Missing R2_BUCKET");
  return bucket;
}

export function cdnUrl(key: string) {
  const base = serverEnv().R2_PUBLIC_URL;
  if (!base) throw new Error("[r2] Missing R2_PUBLIC_URL");
  return `${base.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}
