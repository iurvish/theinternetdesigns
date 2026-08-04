import { config } from "dotenv";

config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { media } from "../lib/db/schema";
import { extractPalette } from "../lib/media/colors";

/**
 * Backfill dominant-colour palettes for media rows that predate the feature.
 *
 * Fetches each media's best available still (thumbnail → poster → original,
 * skipping raw video), extracts the palette in-process via sharp, and writes it
 * back. Idempotent: pass `--force` to recompute rows that already have colours.
 *
 *   bun run scripts/backfill-colors.ts [--force]
 */
async function main() {
  const force = process.argv.includes("--force");
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL / DATABASE_URL is not set.");

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    const rows = await db
      .select({
        id: media.id,
        kind: media.kind,
        originalUrl: media.originalUrl,
        thumbnailUrl: media.thumbnailUrl,
        posterUrl: media.posterUrl,
        colors: media.colors,
      })
      .from(media);

    let done = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const already = Array.isArray(row.colors) && row.colors.length > 0;
      if (already && !force) {
        skipped++;
        continue;
      }

      // Prefer a still image; for video/gif fall back to the poster only.
      const still =
        row.kind === "image"
          ? row.thumbnailUrl ?? row.originalUrl
          : row.posterUrl ?? row.thumbnailUrl;
      if (!still) {
        skipped++;
        continue;
      }

      try {
        const res = await fetch(still, {
          headers: { "user-agent": "Mozilla/5.0 (idesigns)" },
        });
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buffer = Buffer.from(new Uint8Array(await res.arrayBuffer()));
        const colors = await extractPalette(buffer);
        await db.update(media).set({ colors }).where(eq(media.id, row.id));
        done++;
        console.log(
          `✓ ${row.id}  ${colors.map((c) => `${c.hex} ${c.percent}%`).join("  ")}`,
        );
      } catch (err) {
        failed++;
        console.warn(`✗ ${row.id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    console.log(
      `\nDone. updated=${done} skipped=${skipped} failed=${failed} total=${rows.length}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
