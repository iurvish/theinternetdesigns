import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";

const FEED_AUTOPLAY_KEY = "feed_autoplay";

/**
 * Whether videos should autoplay in the feed. When false, feed videos stay on
 * their poster and only play on hover (the lightbox always autoplays on open).
 * Defaults to false and swallows errors so a missing row never breaks the feed.
 */
export async function getFeedAutoplay(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, FEED_AUTOPLAY_KEY))
      .limit(1);
    return row?.value === true;
  } catch {
    return false;
  }
}

export async function setFeedAutoplay(value: boolean): Promise<void> {
  await db
    .insert(settings)
    .values({ key: FEED_AUTOPLAY_KEY, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}
