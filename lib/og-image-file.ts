import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG_IMAGE, SITE_NAME } from "@/lib/site-config";

export const ogImageAlt = OG_IMAGE.alt ?? SITE_NAME;
export const ogImageSize = {
  width: OG_IMAGE.width,
  height: OG_IMAGE.height,
} as const;
export const ogImageContentType = "image/jpeg";

const OG_IMAGE_PATH = join(process.cwd(), "public/og-image.jpg");

/** Raw bytes for Next.js file-based opengraph/twitter image routes. */
export async function readOgImageBytes() {
  return readFile(OG_IMAGE_PATH);
}
