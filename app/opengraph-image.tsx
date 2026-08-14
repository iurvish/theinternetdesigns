import {
  ogImageAlt,
  ogImageContentType,
  ogImageSize,
  readOgImageBytes,
} from "@/lib/og-image-file";

export const alt = ogImageAlt;
export const size = ogImageSize;
export const contentType = ogImageContentType;

export default async function OpenGraphImage() {
  const image = await readOgImageBytes();
  return new Response(image, {
    headers: {
      "Content-Type": ogImageContentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
