import "server-only";
import { cache } from "react";
import { getCorpusIndex } from "@/lib/corpus";
import { rankSimilar } from "@/lib/corpus/similar";

/**
 * Similar designs for the post detail page.
 *
 * The ranking itself lives in `lib/corpus/similar.ts`; this file is the adapter
 * that shapes it into the card the page's strip renders. It used to be ~630
 * lines of pgvector query, six metadata reads and a Jev rerank — about 2.5s of
 * work that `unstable_cache` could only hide on a second visit to the same
 * post. All of it is in memory now, so the cache is gone with it.
 */

export type SimilarPostItem = {
  id: string;
  title: string | null;
  thumbUrl: string | null;
  thumbWidth: number | null;
  thumbHeight: number | null;
  creator: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  similarity: number;
};

export type FindSimilarPostsInput = {
  postId: string;
  limit?: number;
};

export async function findSimilarPosts(
  input: FindSimilarPostsInput,
): Promise<SimilarPostItem[]> {
  const index = await getCorpusIndex();
  return rankSimilar(index, input.postId, input.limit ?? 12).map((hit) => {
    const post = index.posts[hit.position]!;
    const thumb = post.media[0];
    return {
      id: post.id,
      title: post.title,
      thumbUrl: thumb?.thumbUrl ?? null,
      thumbWidth: thumb?.width ?? null,
      thumbHeight: thumb?.height ?? null,
      creator: {
        username: post.creator.username,
        displayName: post.creator.displayName,
        avatarUrl: post.creator.avatarUrl,
      },
      similarity: hit.similarity,
    };
  });
}

/** Request-deduped only — the underlying read is already in-process. */
export const getCachedSimilarPosts = cache((postId: string, limit = 12) =>
  findSimilarPosts({ postId, limit }),
);
