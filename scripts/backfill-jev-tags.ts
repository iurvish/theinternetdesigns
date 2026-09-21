import { config } from "dotenv";

config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const {
  categories,
  industries,
  jevClassifications,
  postCategories,
  postIndustries,
  postStyles,
  posts,
  styles,
} = schema;
import { jevConfigured } from "../lib/jev/client";
import { classifyPost } from "../lib/jev/classify-post";
import { persistClassification } from "../lib/jev/persist-classification";

/**
 * Classify published posts with Jev and write tags.
 * Confident Jev answers replace existing category/style/industry/element tags.
 *
 *   bun --env-file=.env.local scripts/backfill-jev-tags.ts [--limit 50] [--force] [--dry-run]
 */
async function main() {
  const force = process.argv.includes("--force");
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limitIndex = process.argv.indexOf("--limit");
  const limit = limitArg
    ? Number(limitArg.split("=")[1])
    : limitIndex >= 0
      ? Number(process.argv[limitIndex + 1])
      : Number.POSITIVE_INFINITY;

  if (!jevConfigured()) {
    throw new Error("TYPESAFE_AI_API_KEY is required.");
  }

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL / DATABASE_URL is not set.");

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema });

  const classified = force
    ? []
    : await db.select({ postId: jevClassifications.postId }).from(jevClassifications);
  const classifiedIds = new Set(classified.map((r) => r.postId));

  const published = await db
    .select({
      id: posts.id,
      title: posts.title,
      caption: posts.caption,
    })
    .from(posts)
    .where(eq(posts.published, true));

  const pending = published.filter((p) => !classifiedIds.has(p.id)).slice(
    0,
    Number.isFinite(limit) ? limit : published.length,
  );

  console.log(
    `Jev backfill: ${pending.length} posts (${classifiedIds.size} already classified, ${published.length} published)${dryRun ? " [dry-run]" : ""}`,
  );

  let done = 0;
  let tagged = 0;
  let skipped = 0;
  const concurrency = 3;

  async function loadBags(postIds: string[]) {
    if (postIds.length === 0) {
      return new Map<
        string,
        { categories: string[]; styles: string[]; industries: string[]; elements: string[] }
      >();
    }
    const bags = new Map<
      string,
      { categories: string[]; styles: string[]; industries: string[]; elements: string[] }
    >();
    for (const id of postIds) {
      bags.set(id, { categories: [], styles: [], industries: [], elements: [] });
    }
    const [catRows, styleRows, industryRows, elementRows] = await Promise.all([
      db
        .select({ postId: postCategories.postId, slug: categories.slug })
        .from(postCategories)
        .innerJoin(categories, eq(categories.id, postCategories.categoryId))
        .where(inArray(postCategories.postId, postIds)),
      db
        .select({ postId: postStyles.postId, slug: styles.slug })
        .from(postStyles)
        .innerJoin(styles, eq(styles.id, postStyles.styleId))
        .where(inArray(postStyles.postId, postIds)),
      db
        .select({ postId: postIndustries.postId, slug: industries.slug })
        .from(postIndustries)
        .innerJoin(industries, eq(industries.id, postIndustries.industryId))
        .where(inArray(postIndustries.postId, postIds)),
      db.execute<{ postId: string; slug: string }>(sql`
        select pe.post_id as "postId", e.slug
        from post_elements pe
        join elements e on e.id = pe.element_id
        where pe.post_id in (${sql.join(
          postIds.map((id) => sql`${id}`),
          sql`, `,
        )})
      `),
    ]);
    for (const row of catRows) bags.get(row.postId)?.categories.push(row.slug);
    for (const row of styleRows) bags.get(row.postId)?.styles.push(row.slug);
    for (const row of industryRows) bags.get(row.postId)?.industries.push(row.slug);
    const elRows = Array.isArray(elementRows)
      ? elementRows
      : (elementRows as { rows: { postId: string; slug: string }[] }).rows;
    for (const row of elRows) bags.get(row.postId)?.elements.push(row.slug);
    return bags;
  }

  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    const bags = await loadBags(batch.map((p) => p.id));
    await Promise.all(
      batch.map(async (post) => {
        const bag = bags.get(post.id) ?? {
          categories: [],
          styles: [],
          industries: [],
          elements: [],
        };
        const classification = await classifyPost({
          title: post.title,
          caption: post.caption,
          ...bag,
        });
        if (!classification) {
          skipped += 1;
          return;
        }
        if (!dryRun) {
          const applied = await persistClassification(db, post.id, classification);
          if (
            applied.applyCategory ||
            applied.applyStyle ||
            applied.applyIndustry ||
            applied.applyElement
          ) {
            tagged += 1;
          }
        } else if (
          classification.applyCategory ||
          classification.applyStyle ||
          classification.applyIndustry ||
          classification.applyElement
        ) {
          tagged += 1;
        }
        done += 1;
        if (done % 10 === 0 || done === pending.length) {
          console.log(`  ${done}/${pending.length} classified, ${tagged} tags updated, ${skipped} skipped`);
        }
      }),
    );
  }

  console.log(`Done. classified=${done} updated=${tagged} skipped=${skipped}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
