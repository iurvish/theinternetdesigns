"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { classifyPostTags } from "@/lib/ai/classify-post-tags";
import { ensurePublicCategories } from "@/lib/db/ensure-public-categories";
import { ensureIndustries } from "@/lib/db/ensure-industries";

export type ClassifyTagsResult =
  | {
      ok: true;
      categoryIds: string[];
      industryIds: string[];
      categorySlugs: string[];
      industrySlugs: string[];
    }
  | { ok: false; error: string };

export async function classifyPostTagsAction(input: {
  imageUrl: string;
  caption?: string;
}): Promise<ClassifyTagsResult> {
  await requireAdmin();

  try {
    const [{ categorySlugs, industrySlugs }, categories, industries] =
      await Promise.all([
        classifyPostTags(input),
        ensurePublicCategories(),
        ensureIndustries(),
      ]);

    const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const indBySlug = new Map(industries.map((i) => [i.slug, i.id]));

    const categoryIds = categorySlugs
      .map((s) => catBySlug.get(s))
      .filter((id): id is string => Boolean(id));
    const industryIds = industrySlugs
      .map((s) => indBySlug.get(s))
      .filter((id): id is string => Boolean(id));

    if (categoryIds.length === 0 && industryIds.length === 0) {
      return {
        ok: false,
        error:
          "AI returned tags that are not in our lists — select categories and industries manually.",
      };
    }

    return {
      ok: true,
      categoryIds,
      industryIds,
      categorySlugs,
      industrySlugs,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI classification failed.";
    return { ok: false, error: message };
  }
}
