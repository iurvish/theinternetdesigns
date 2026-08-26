import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { media, mediaCopies } from "@/lib/db/schema";

export const runtime = "nodejs";

const bodySchema = z.object({
  mediaId: z.string().min(1),
});

/**
 * Public, fire-and-forget copy tracker.
 * Called after a successful clipboard write on the gallery.
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
      id: media.id,
      postId: media.postId,
      kind: media.kind,
    })
    .from(media)
    .where(eq(media.id, parsed.data.mediaId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.insert(mediaCopies).values({
    id: randomUUID(),
    mediaId: row.id,
    postId: row.postId,
    kind: row.kind,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
