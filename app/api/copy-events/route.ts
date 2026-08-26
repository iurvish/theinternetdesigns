import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { media, mediaCopies, posts } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  mediaId: z.string().regex(UUID),
});

/**
 * Public, fire-and-forget copy tracker.
 *
 * The client only sends the media id. Post and creator are resolved from
 * published rows so a spoofed payload cannot attribute copies to someone else.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "mediaId required" }, { status: 400 });
  }

  const [row] = await db
    .select({
      mediaId: media.id,
      postId: posts.id,
      creatorId: posts.creatorId,
      kind: media.kind,
    })
    .from(media)
    .innerJoin(posts, eq(posts.id, media.postId))
    .where(and(eq(media.id, parsed.data.mediaId), eq(posts.published, true)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.insert(mediaCopies).values({
    id: randomUUID(),
    mediaId: row.mediaId,
    postId: row.postId,
    creatorId: row.creatorId,
    kind: row.kind,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
