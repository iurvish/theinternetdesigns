import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { getRecentPosts } from "@/features/posts/queries";
import type { PostListItem } from "@/features/posts/queries";
import { ExploreFeed, type PostsResult } from "@/features/posts/explore-feed";
import { SetupRequired } from "@/components/setup-required";
import { PaperCurl } from "@/components/paper-curl";
import { getFeedAutoplay } from "@/lib/settings";

export default function HomePage() {
  return (
    <div className="flex w-full flex-col items-center bg-[#f7f7f7] px-7">
      <div className="flex w-full flex-1 flex-col items-start px-4 sm:px-10 lg:px-18">
        {/* Hero heading */}
        <div className="relative flex w-full items-center justify-center border-r border-b border-l border-[#e3e5e8] py-12 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff] [container-type:inline-size] sm:py-18 lg:py-24">
          {/* Decorative paper-curl at the sheet's top-right corner */}
          <PaperCurl />
          {/* Size scales to the bordered box's own width (container query units),
              so the single line can never overflow the left/right borders. */}
          {/*
            Embossed near-white wordmark (matching the Paper design). It is drawn
            as two stacked copies of the same text:
              • Bottom layer carries the light -webkit-text-stroke that gives the
                letters their edge on the pale background.
              • Top layer is an identical SOLID fill with no stroke.
            Why two layers: letter-spacing is negative, so adjacent glyphs overlap.
            -webkit-text-stroke outlines every glyph fully, so on its own it draws
            the buried edges of overlapped letters as stray boxes/lines. The opaque
            top fill covers those interior marks, leaving only the clean outer edge.
            The soft emboss shadow is applied to the composited result via filter.
          */}
          <h1
            className="relative grid whitespace-nowrap text-center text-[clamp(1.75rem,8cqw,8rem)] font-bold capitalize leading-none"
            style={{
              fontFamily: "var(--font-sans)",
              letterSpacing: "-0.04em",
              filter:
                "drop-shadow(0px 3px 1.5px #0000000D) drop-shadow(0px 1px 0.5px #0000000F) drop-shadow(0px 1px 0.5px #00000026)",
            }}
          >
            <span
              aria-hidden="true"
              className="col-start-1 row-start-1"
              style={{ color: "#fcfcfc", WebkitTextStroke: "1.2px #D1D1D1B3" }}
            >
              the internet designs
            </span>
            <span
              className="col-start-1 row-start-1"
              style={{ color: "#fcfcfc" }}
            >
              the internet designs
            </span>
          </h1>
        </div>

        <HomeShell />
      </div>
    </div>
  );
}

/**
 * Categories are awaited (fast) so the filter bar is in the initial HTML and
 * never blanks out on refresh; the slower posts query is passed down as a
 * promise and streamed into the grid via a Suspense boundary inside ExploreFeed.
 */
async function HomeShell() {
  let cats: { slug: string; name: string }[];
  try {
    cats = await db
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.sortOrder));
  } catch (err) {
    return (
      <div className="w-full border-r border-b border-l border-[#e3e5e8] p-3.5 shadow-[-1px_0_0_0_#fff,1px_0_0_0_#fff,0_1px_0_0_#fff]">
        <SetupRequired
          detail={err instanceof Error ? err.message : String(err)}
        />
      </div>
    );
  }

  const feedAutoplay = await getFeedAutoplay();

  const postsPromise: Promise<PostsResult> = getRecentPosts({ limit: 60 })
    .then((posts) => ({ posts, error: null }))
    .catch((err) => ({
      posts: [] as PostListItem[],
      error: err instanceof Error ? err.message : String(err),
    }));

  return (
    <ExploreFeed
      categories={cats}
      postsPromise={postsPromise}
      feedAutoplay={feedAutoplay}
    />
  );
}
