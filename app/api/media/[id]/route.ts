import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { media, posts } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { r2Bucket, r2Client } from "@/lib/r2/client";

export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONTENT_TYPE_FALLBACK: Record<string, string> = {
  image: "image/avif",
  video: "video/mp4",
  gif: "video/mp4",
};

/**
 * Same-origin proxy for one published media row.
 *
 * The browser cannot read CDN bytes (no CORS), which breaks both clipboard
 * copy and canvas frame capture. Keying on the database id — never a URL —
 * keeps this from becoming an SSRF hop.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Invalid media id", { status: 400 });

  const [row] = await db
    .select({
      kind: media.kind,
      originalUrl: media.originalUrl,
      mediumUrl: media.mediumUrl,
    })
    .from(media)
    .innerJoin(posts, eq(posts.id, media.postId))
    .where(and(eq(media.id, id), eq(posts.published, true)))
    .limit(1);

  if (!row) return new Response("Media not found", { status: 404 });

  const publicBase = serverEnv().R2_PUBLIC_URL;
  if (!publicBase) return new Response("Media unavailable", { status: 502 });

  const wantsOriginal = req.nextUrl.searchParams.get("v") !== "medium";
  const source = wantsOriginal
    ? row.originalUrl
    : (row.mediumUrl ?? row.originalUrl);

  let key: string;
  try {
    const base = new URL(publicBase);
    const stored = new URL(source);
    if (stored.origin !== base.origin) throw new Error("origin");
    const basePath = base.pathname.replace(/\/$/, "");
    if (basePath && !stored.pathname.startsWith(`${basePath}/`)) {
      throw new Error("prefix");
    }
    key = decodeURIComponent(
      stored.pathname.slice(basePath.length).replace(/^\//, ""),
    );
    if (!key) throw new Error("key");
  } catch {
    return new Response("Media unavailable", { status: 502 });
  }

  const range = req.headers.get("range") ?? undefined;

  try {
    const obj = await r2Client().send(
      new GetObjectCommand({ Bucket: r2Bucket(), Key: key, Range: range }),
    );
    if (!obj.Body) return new Response("Media unavailable", { status: 502 });

    const headers = new Headers();
    headers.set(
      "content-type",
      obj.ContentType ?? CONTENT_TYPE_FALLBACK[row.kind] ?? "application/octet-stream",
    );
    headers.set("accept-ranges", "bytes");
    headers.set("x-content-type-options", "nosniff");
    headers.set("cache-control", "private, max-age=300");
    if (obj.ContentLength != null) {
      headers.set("content-length", String(obj.ContentLength));
    }
    if (obj.ContentRange) headers.set("content-range", obj.ContentRange);

    return new Response(obj.Body.transformToWebStream(), {
      status: obj.ContentRange ? 206 : 200,
      headers,
    });
  } catch {
    return new Response("Media unavailable", { status: 502 });
  }
}
