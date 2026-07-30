import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { serverEnv } from "@/lib/env";
import { r2Bucket, r2Client } from "./client";

function keyFromUrl(url: string): string | null {
  const base = serverEnv().R2_PUBLIC_URL;
  if (!base) return null;
  const trimmed = base.replace(/\/$/, "");
  if (!url.startsWith(trimmed + "/")) return null;
  return url.slice(trimmed.length + 1);
}

export async function deleteR2Urls(urls: (string | null | undefined)[]): Promise<void> {
  const keys = Array.from(
    new Set(
      urls
        .filter((u): u is string => Boolean(u))
        .map(keyFromUrl)
        .filter((k): k is string => Boolean(k)),
    ),
  );
  if (keys.length === 0) return;

  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await r2Client().send(
      new DeleteObjectsCommand({
        Bucket: r2Bucket(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
