import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { fetchPin } from "@/lib/providers/pinterest/fetch-pin";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  await requireAdmin();
  const { id, idx } = await params;

  if (!/^\d{5,25}$/.test(id)) {
    return new Response("Invalid pin id", { status: 400 });
  }
  const index = Number(idx);
  if (!Number.isInteger(index) || index < 0 || index > 20) {
    return new Response("Invalid media index", { status: 400 });
  }

  let pin;
  try {
    pin = await fetchPin(id);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Fetch failed", {
      status: 502,
    });
  }
  const m = pin.media[index];
  if (!m || m.kind === "image") {
    return new Response("Media not found", { status: 404 });
  }

  const upstreamHeaders: Record<string, string> = {
    "user-agent": "Mozilla/5.0 (idesigns)",
  };
  const range = req.headers.get("range");
  if (range) upstreamHeaders.range = range;
  const cookie = process.env.PINTEREST_COOKIE?.trim();
  if (cookie) upstreamHeaders.cookie = cookie;

  const upstream = await fetch(m.url, { headers: upstreamHeaders });
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Upstream error ${upstream.status}`, { status: 502 });
  }

  const headers = new Headers();
  headers.set(
    "content-type",
    upstream.headers.get("content-type") ?? "video/mp4",
  );
  headers.set("accept-ranges", "bytes");
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) headers.set("content-range", cr);
  headers.set("cache-control", "private, max-age=300");

  return new Response(upstream.body, { status: upstream.status, headers });
}
