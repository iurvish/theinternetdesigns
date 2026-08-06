"use server";

import { searchPostsByColors, type PostListItem } from "./queries";

/**
 * Server action so the feed can be filtered by colour in place (no navigation).
 * Mirrors the /search route's colour query, but returns the posts to the client
 * to swap into the existing grid.
 */
export async function searchByColorsAction(
  hexes: string[],
): Promise<PostListItem[]> {
  const clean = hexes
    .filter((c) => /^#[0-9a-f]{6}$/i.test(c))
    .slice(0, 2);
  if (clean.length === 0) return [];
  return searchPostsByColors(clean, { limit: 120 });
}
