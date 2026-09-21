import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import {
  categories,
  industries,
  jevClassifications,
  postCategories,
  postIndustries,
  postStyles,
  styles,
} from "@/lib/db/schema";
import { JEV_MODEL } from "./client";
import type { PostClassification } from "./classify-post";

type Db = PostgresJsDatabase<typeof schema>;

async function idBySlug(
  db: Db,
  table: typeof categories | typeof styles | typeof industries,
  slug: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.slug, slug))
    .limit(1);
  return row?.id ?? null;
}

export async function persistClassification(
  db: Db,
  postId: string,
  classification: PostClassification,
): Promise<PostClassification> {
  const applied = {
    category: false,
    style: false,
    industry: false,
    element: false,
  };

  if (classification.applyCategory && classification.category) {
    const id = await idBySlug(db, categories, classification.category);
    if (id) {
      await db.delete(postCategories).where(eq(postCategories.postId, postId));
      await db.insert(postCategories).values({ postId, categoryId: id });
      applied.category = true;
    }
  }

  if (classification.applyStyle && classification.style) {
    const id = await idBySlug(db, styles, classification.style);
    if (id) {
      await db.delete(postStyles).where(eq(postStyles.postId, postId));
      await db.insert(postStyles).values({ postId, styleId: id });
      applied.style = true;
    }
  }

  if (classification.applyIndustry && classification.industry) {
    const id = await idBySlug(db, industries, classification.industry);
    if (id) {
      await db.delete(postIndustries).where(eq(postIndustries.postId, postId));
      await db.insert(postIndustries).values({ postId, industryId: id });
      applied.industry = true;
    }
  }

  if (classification.applyElement && classification.element) {
    await db.execute(sql`
      delete from post_elements where post_id = ${postId}
    `);
    await db.execute(sql`
      insert into post_elements (post_id, element_id, ai_suggested)
      select ${postId}, e.id, true
      from elements e
      where e.slug = ${classification.element}
    `);
    applied.element = true;
  }

  await db
    .insert(jevClassifications)
    .values({
      postId,
      isUi: classification.isUi,
      isUiProbability: Math.round(classification.isUiProbability * 100),
      categorySlug: classification.category,
      styleSlug: classification.style,
      industrySlug: classification.industry,
      elementSlug: classification.element,
      applied,
      model: JEV_MODEL,
    })
    .onConflictDoUpdate({
      target: jevClassifications.postId,
      set: {
        classifiedAt: sql`now()`,
        isUi: classification.isUi,
        isUiProbability: Math.round(classification.isUiProbability * 100),
        categorySlug: classification.category,
        styleSlug: classification.style,
        industrySlug: classification.industry,
        elementSlug: classification.element,
        applied,
        model: JEV_MODEL,
        updatedAt: sql`now()`,
      },
    });

  return { ...classification, ...toApplyFlags(applied) };
}

function toApplyFlags(applied: {
  category: boolean;
  style: boolean;
  industry: boolean;
  element: boolean;
}): Pick<
  PostClassification,
  "applyCategory" | "applyStyle" | "applyIndustry" | "applyElement"
> {
  return {
    applyCategory: applied.category,
    applyStyle: applied.style,
    applyIndustry: applied.industry,
    applyElement: applied.element,
  };
}
