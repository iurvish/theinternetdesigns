"use server";

import { getRecentPosts, type FeedSort, type PostListItem } from "./queries";

const PAGE_SIZE = 24;

export async function loadFeedPageAction(opts: {
  offset: number;
  category?: string;
  sort?: FeedSort;
  limit?: number;
}): Promise<PostListItem[]> {
  return getRecentPosts({
    limit: opts.limit ?? PAGE_SIZE,
    offset: Math.max(0, opts.offset),
    category: opts.category ?? "all",
    sort: opts.sort ?? "recent",
  });
}
