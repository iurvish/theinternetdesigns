import "server-only";

import { randomUUID } from "node:crypto";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { styles } from "@/lib/db/schema";
import { ADMIN_STYLE_LIST } from "@/features/admin/style-list";

const SLUG_SET = new Set<string>(ADMIN_STYLE_LIST.map((c) => c.slug));

function missingTableError(cause: unknown): never {
  const detail = cause instanceof Error ? cause.message : String(cause);
  throw new Error(
    `Styles table is missing or unreachable. Run \`bun run db:migrate\` and restart the dev server.\n\n${detail}`,
  );
}

/** Upsert admin style tags so pickers always have the full list. */
export async function ensureStyles() {
  let existing: { slug: string }[];
  try {
    existing = await db.select({ slug: styles.slug }).from(styles);
  } catch (err) {
    missingTableError(err);
  }

  const have = new Set(existing.filter((c) => SLUG_SET.has(c.slug)).map((c) => c.slug));
  const missing = ADMIN_STYLE_LIST.filter((c) => !have.has(c.slug));

  if (missing.length > 0) {
    try {
      await db.insert(styles).values(
        missing.map((c, i) => ({
          id: randomUUID(),
          slug: c.slug,
          name: c.name,
          sortOrder: ADMIN_STYLE_LIST.findIndex((x) => x.slug === c.slug) ?? i,
        })),
      );
    } catch (err) {
      missingTableError(err);
    }
  }

  let rows: { id: string; name: string; slug: string }[];
  try {
    rows = await db
      .select({ id: styles.id, name: styles.name, slug: styles.slug })
      .from(styles)
      .orderBy(asc(styles.sortOrder), asc(styles.name));
  } catch (err) {
    missingTableError(err);
  }

  const order = new Map<string, number>(
    ADMIN_STYLE_LIST.map((c, i) => [c.slug, i]),
  );
  return rows
    .filter((r) => SLUG_SET.has(r.slug))
    .sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99));
}
