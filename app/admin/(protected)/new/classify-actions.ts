"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { classifyPostTags } from "@/lib/ai/classify-post-tags";
import { ensurePublicCategories } from "@/lib/db/ensure-public-categories";
import { ensureIndustries } from "@/lib/db/ensure-industries";
import { ensureStyles } from "@/lib/db/ensure-styles";

export type ClassifyTagsResult =
  | {
      ok: true;
      /** Always 0 or 1 id — AI picks a single category. */
      categoryIds: string[];
      industryIds: string[];
      styleIds: string[];
      categorySlugs: string[];
      industrySlugs: string[];
      styleSlugs: string[];
    }
  | { ok: false; error: string };

export async function classifyPostTagsAction(input: {
  imageUrl: string;
  caption?: string;
}): Promise<ClassifyTagsResult> {
  await requireAdmin();

  try {
    const [
      { categorySlugs, industrySlugs, styleSlugs },
      categories,
      industries,
      styles,
    ] = await Promise.all([
      classifyPostTags(input),
      ensurePublicCategories(),
      ensureIndustries(),
      ensureStyles(),
    ]);

    const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const indBySlug = new Map(industries.map((i) => [i.slug, i.id]));
    const styleBySlug = new Map(styles.map((s) => [s.slug, s.id]));

    const categoryIds = categorySlugs
      .slice(0, 1)
      .map((s) => catBySlug.get(s))
      .filter((id): id is string => Boolean(id));
    const industryIds = industrySlugs
      .map((s) => indBySlug.get(s))
      .filter((id): id is string => Boolean(id));
    const styleIds = styleSlugs
      .map((s) => styleBySlug.get(s))
      .filter((id): id is string => Boolean(id));

    if (
      categoryIds.length === 0 &&
      industryIds.length === 0 &&
      styleIds.length === 0
    ) {
      return {
        ok: false,
        error:
          "AI returned tags that are not in our lists — select category, industries, and styles manually.",
      };
    }

    return {
      ok: true,
      categoryIds,
      industryIds,
      styleIds,
      categorySlugs: categorySlugs.slice(0, 1),
      industrySlugs,
      styleSlugs,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI classification failed.";
    return { ok: false, error: message };
  }
}
