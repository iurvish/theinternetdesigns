import { PutObjectCommand } from "@aws-sdk/client-s3";
import { cdnUrl, r2Bucket, r2Client } from "./client";

export type UploadInput = {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  cacheControl?: string;
};

/**
 * Upload a single object to R2 and return its public CDN URL.
 * Uses PutObject (fine for our sizes — images/AVIF + short videos).
 */
export async function uploadToR2(input: UploadInput): Promise<string> {
  await r2Client().send(
    new PutObjectCommand({
      Bucket: r2Bucket(),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: input.cacheControl ?? "public, max-age=31536000, immutable",
    }),
  );
  return cdnUrl(input.key);
}
