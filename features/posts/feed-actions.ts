"use server";

import {
  getRecentPosts,
  getSimilarPosts,
  type FeedOrder,
  type FeedSurface,
  type FeedView,
  type PostListItem,
} from "./queries";

const PAGE_SIZE = 24;

export async function loadFeedPageAction(opts: {
  offset: number;
  category?: string;
  view?: FeedView;
  order?: FeedOrder;
  surface?: FeedSurface;
  limit?: number;
}): Promise<PostListItem[]> {
  return getRecentPosts({
    limit: opts.limit ?? PAGE_SIZE,
    offset: Math.max(0, opts.offset),
    category: opts.category ?? "all",
    view: opts.view ?? "all",
    order: opts.order ?? "recent",
    surface: opts.surface ?? "designs",
  });
}

export async function loadSimilarPostsAction(
  postId: string,
): Promise<PostListItem[]> {
  if (!postId) return [];
  return getSimilarPosts(postId, 12);
}
