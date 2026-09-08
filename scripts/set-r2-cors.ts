import { config } from "dotenv";
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

config({ path: ".env.local" });

/**
 * Allow the gallery origin to read CDN image/video pixels into a canvas so
 * overlay copy can snapshot the on-screen frame instead of re-downloading.
 *
 *   npx tsx scripts/set-r2-cors.ts
 *
 * After applying, purge the custom-domain cache (Cloudflare → Caching →
 * Configuration → Purge Cache) so already-cached objects pick up the headers.
 */
async function main() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log("Existing CORS:", JSON.stringify(current.CORSRules ?? [], null, 2));
  } catch {
    console.log("No existing CORS policy.");
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ["*"],
            AllowedMethods: ["GET", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: [
              "ETag",
              "Content-Type",
              "Content-Length",
              "Content-Range",
              "Accept-Ranges",
            ],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    }),
  );

  const verify = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log("Updated CORS:", JSON.stringify(verify.CORSRules ?? [], null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
