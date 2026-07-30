import "server-only";
import sharp from "sharp";
import { uploadToR2 } from "@/lib/r2/upload";

const MAX_WIDTH = 1920;
const THUMB_WIDTH = 640;

async function download(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (idesigns)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  const arr = new Uint8Array(await res.arrayBuffer());
  return {
    buffer: Buffer.from(arr),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

export type ProcessedImage = {
  originalUrl: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
};

export async function processImage(
  sourceUrl: string,
  keyPrefix: string,
): Promise<ProcessedImage> {
  const { buffer } = await download(sourceUrl);
  const img = sharp(buffer, { failOn: "none" });
  const meta = await img.metadata();

  const [fullAvif, thumbAvif] = await Promise.all([
    sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .avif({ quality: 70, effort: 4 })
      .toBuffer(),
    sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .avif({ quality: 55, effort: 4 })
      .toBuffer(),
  ]);

  const [originalUrl, thumbnailUrl] = await Promise.all([
    uploadToR2({
      key: `${keyPrefix}/original.avif`,
      body: fullAvif,
      contentType: "image/avif",
    }),
    uploadToR2({
      key: `${keyPrefix}/thumb.avif`,
      body: thumbAvif,
      contentType: "image/avif",
    }),
  ]);

  return {
    originalUrl,
    thumbnailUrl,
    width: meta.width ?? null,
    height: meta.height ?? null,
  };
}

export type ProcessedVideo = {
  originalUrl: string;
  posterUrl: string | null;
};

export async function processVideo(
  sourceUrl: string,
  posterSourceUrl: string | null,
  keyPrefix: string,
): Promise<ProcessedVideo> {
  const { buffer, contentType } = await download(sourceUrl);
  const baseType = contentType.split(";")[0].trim().toLowerCase();
  const looksMp4 = baseType === "video/mp4" || /\.mp4(\?|$)/i.test(sourceUrl);
  const finalType = looksMp4 ? "video/mp4" : baseType.startsWith("video/") ? baseType : "video/mp4";
  const originalUrl = await uploadToR2({
    key: `${keyPrefix}/video.mp4`,
    body: buffer,
    contentType: finalType,
  });

  let posterUrl: string | null = null;
  if (posterSourceUrl) {
    try {
      const poster = await download(posterSourceUrl);
      const posterAvif = await sharp(poster.buffer, { failOn: "none" })
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .avif({ quality: 60, effort: 4 })
        .toBuffer();
      posterUrl = await uploadToR2({
        key: `${keyPrefix}/poster.avif`,
        body: posterAvif,
        contentType: "image/avif",
      });
    } catch {
      posterUrl = null;
    }
  }

  return { originalUrl, posterUrl };
}

export async function uploadAvatar(
  sourceUrl: string,
  keyPrefix: string,
): Promise<string | null> {
  try {
    const { buffer } = await download(sourceUrl);
    const avif = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 200, height: 200, fit: "cover" })
      .avif({ quality: 65, effort: 4 })
      .toBuffer();
    return await uploadToR2({
      key: `${keyPrefix}/avatar.avif`,
      body: avif,
      contentType: "image/avif",
    });
  } catch {
    return null;
  }
}
