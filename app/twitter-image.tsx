import {
  ogImageAlt,
  ogImageContentType,
  ogImageSize,
  readOgImageBytes,
} from "@/lib/og-image-file";

export const alt = ogImageAlt;
export const size = ogImageSize;
export const contentType = ogImageContentType;

/** Explicit twitter:image — X reads this in addition to og:image. */
export default async function TwitterImage() {
  const image = await readOgImageBytes();
  return new Response(image, {
    headers: {
      "Content-Type": ogImageContentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
