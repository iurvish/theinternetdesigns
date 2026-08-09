import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import sharp from "sharp";
import { z } from "zod";
import { ADMIN_INDUSTRY_LIST } from "@/features/admin/industry-list";
import { PUBLIC_CATEGORY_NAV } from "@/features/posts/public-categories";

const CLASSIFY_MODEL = "gemini-2.5-flash";

const tagSchema = z.object({
  categories: z
    .array(z.string())
    .describe("Category slugs that match the design (0–3, from allowed list only)"),
  industries: z
    .array(z.string())
    .describe("Industry slugs that match the product/brand (0–3, from allowed list only)"),
});

export type ClassifyPostTagsInput = {
  imageUrl: string;
  caption?: string;
};

export type ClassifyPostTagsOutput = {
  categorySlugs: string[];
  industrySlugs: string[];
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

  return `You classify UI/design posts for a design inspiration gallery.

Look at the screenshot and${caption ? " use the caption as extra context." : " classify from the visual alone."}

Pick ONLY slugs from the lists below. Return 0–3 categories and 0–3 industries.
Prefer precision over quantity — only tag when reasonably confident.

Categories (design type):
${categoryLines}

Industries (product/market vertical):
${industryLines}

${caption ? `Caption:\n${caption.slice(0, 800)}` : ""}`.trim();
}

function filterSlugs(candidates: string[], allowed: Set<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const slug = raw.trim().toLowerCase();
    if (!allowed.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= 3) break;
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

  const categorySlugs = filterSlugs(output.categories, allowedCategories);
  const industrySlugs = filterSlugs(output.industries, allowedIndustries);

  if (categorySlugs.length === 0 && industrySlugs.length === 0) {
    throw new Error(
      "AI could not match any categories or industries — pick them manually.",
    );
  }

  return { categorySlugs, industrySlugs };
}
