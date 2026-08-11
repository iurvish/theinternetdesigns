import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import sharp from "sharp";
import { z } from "zod";
import { ADMIN_INDUSTRY_LIST } from "@/features/admin/industry-list";
import { ADMIN_STYLE_LIST } from "@/features/admin/style-list";
import { PUBLIC_CATEGORY_NAV } from "@/features/posts/public-categories";

const CLASSIFY_MODEL = "gemini-3.6-flash";

const tagSchema = z.object({
  category: z
    .string()
    .nullable()
    .describe(
      "Exactly one category slug from the allowed list, or null if none fit",
    ),
  industries: z
    .array(z.string())
    .describe("Industry slugs that match the product/brand (0–3, from allowed list only)"),
  styles: z
    .array(z.string())
    .describe("Visual style slugs that match the look (0–3, from allowed list only)"),
});

export type ClassifyPostTagsInput = {
  imageUrl: string;
  caption?: string;
};

export type ClassifyPostTagsOutput = {
  /** At most one category slug. */
  categorySlugs: string[];
  industrySlugs: string[];
  styleSlugs: string[];
};

function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

/** Downscale for fewer vision tokens — keeps enough detail for UI classification. */
async function fetchPreviewImage(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (TheInternetDesigns)" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Could not fetch preview image (${res.status}).`);
  }
  const raw = Buffer.from(new Uint8Array(await res.arrayBuffer()));
  return sharp(raw)
    .rotate()
    .resize(768, 768, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

function buildPrompt(caption?: string): string {
  const categoryLines = PUBLIC_CATEGORY_NAV.map(
    (c) => `- ${c.slug}: ${c.name}`,
  ).join("\n");
  const industryLines = ADMIN_INDUSTRY_LIST.map(
    (i) => `- ${i.slug}: ${i.name}`,
  ).join("\n");
  const styleLines = ADMIN_STYLE_LIST.map(
    (s) => `- ${s.slug}: ${s.name}`,
  ).join("\n");

  return `You classify UI/design posts for a design inspiration gallery.

Look at the screenshot and${caption ? " use the caption as extra context." : " classify from the visual alone."}

Pick ONLY slugs from the lists below.
- Categories: pick EXACTLY ONE best-fit category slug (or null if none fit). Never pick more than one.
- Industries: 0–3 slugs
- Styles: 0–3 slugs
Prefer precision over quantity — only tag when reasonably confident.

Categories (design type — pick one):
${categoryLines}

Industries (product/market vertical):
${industryLines}

Styles (visual look / aesthetic):
${styleLines}

Style hints:
- light: bright backgrounds, soft neutrals, lots of white space
- dark: dark UI, night mode, charcoal/black surfaces
- colorful: bold multi-color, vibrant accents
- minimal: sparse layout, few elements, restrained type
- playful: whimsical, rounded, fun illustration or motion
- gradient: prominent color gradients on surfaces or backgrounds
- futuristic: sci-fi, neon, glass, techy chrome
- enterprise: corporate, dense data, professional SaaS look
- isometric: isometric 3D scenes or illustrations

${caption ? `Caption:\n${caption.slice(0, 800)}` : ""}`.trim();
}

function filterSlugs(
  candidates: string[],
  allowed: Set<string>,
  max: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const slug = raw.trim().toLowerCase();
    if (!allowed.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}

export async function classifyPostTags(
  input: ClassifyPostTagsInput,
): Promise<ClassifyPostTagsOutput> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local to use AI tagging.",
    );
  }

  const image = await fetchPreviewImage(input.imageUrl);
  const google = createGoogleGenerativeAI({ apiKey });

  const { output } = await generateText({
    model: google(CLASSIFY_MODEL),
    output: Output.object({ schema: tagSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildPrompt(input.caption) },
          { type: "image", image, mediaType: "image/jpeg" },
        ],
      },
    ],
  });

  if (!output) {
    throw new Error("AI returned no classification — try again or pick tags manually.");
  }

  const allowedCategories = new Set(PUBLIC_CATEGORY_NAV.map((c) => c.slug));
  const allowedIndustries = new Set(ADMIN_INDUSTRY_LIST.map((i) => i.slug));
  const allowedStyles = new Set(ADMIN_STYLE_LIST.map((s) => s.slug));

  const categorySlugs = filterSlugs(
    output.category ? [output.category] : [],
    allowedCategories,
    1,
  );
  const industrySlugs = filterSlugs(output.industries, allowedIndustries, 3);
  const styleSlugs = filterSlugs(output.styles, allowedStyles, 3);

  if (
    categorySlugs.length === 0 &&
    industrySlugs.length === 0 &&
    styleSlugs.length === 0
  ) {
    throw new Error(
      "AI could not match any category, industries, or styles — pick them manually.",
    );
  }

  return { categorySlugs, industrySlugs, styleSlugs };
}
