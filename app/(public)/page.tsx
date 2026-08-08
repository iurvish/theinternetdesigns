import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { getRecentPosts } from "@/features/posts/queries";
import type { PostListItem } from "@/features/posts/queries";
import { ExploreFeed, type PostsResult } from "@/features/posts/explore-feed";
import { SetupRequired } from "@/components/setup-required";
import { PaperCurl } from "@/components/paper-curl";

export default function HomePage() {
  return (
    <div className="flex w-full flex-col items-center bg-[#f7f7f7] px-1 sm:px-7">
      <div className="flex w-full flex-1 flex-col items-start px-1 sm:px-10 lg:px-18">
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
            className="relative grid whitespace-nowrap text-center text-[clamp(2.5rem,15cqw,9.5rem)] font-bold capitalize leading-[0.95] [filter:drop-shadow(0px_2.7px_1.5px_#0000000A)_drop-shadow(0px_0.8px_0.5px_#0000000C)_drop-shadow(0px_0.8px_0.5px_#00000020)] sm:text-[clamp(2rem,9cqw,9.5rem)] sm:leading-none lg:[filter:drop-shadow(0px_3px_1.5px_#0000000D)_drop-shadow(0px_1px_0.5px_#0000000F)_drop-shadow(0px_1px_0.5px_#00000026)]"
            style={{
              fontFamily: "var(--font-sans)",
              letterSpacing: "-0.04em",
            }}
          >
            <span
              aria-hidden="true"
              className="col-start-1 row-start-1"
              style={{ color: "#fcfcfc", WebkitTextStroke: "1.2px #D1D1D1B3" }}
            >
              <Wordmark />
            </span>
            <span
              className="col-start-1 row-start-1"
              style={{
                // Top → bottom gradient fill (no stroke here, so combining it
                // with background-clip:text is safe — the stroke lives on the
                // bottom layer only).
                backgroundImage: "linear-gradient(180deg, #fafafa 0%, #ffffff 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
                WebkitTextFillColor: "transparent",
              }}
            >
              <Wordmark />
            </span>
          </h1>
        </div>

        <HomeShell />
      </div>
    </div>
  );
}

/**
 * The wordmark breaks onto two lines below `sm` so the line can stay large on
 * phones instead of shrinking to fit one row.
 */
function Wordmark() {
  return (
    <>
      the internet
      <span className="sm:hidden">
        <br />
      </span>
      <span className="hidden sm:inline">&nbsp;</span>
      designs
    </>
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

  const postsPromise: Promise<PostsResult> = getRecentPosts({ limit: 24 })
    .then((posts) => ({ posts, error: null }))
    .catch((err) => ({
      posts: [] as PostListItem[],
      error: err instanceof Error ? err.message : String(err),
    }));

  return <ExploreFeed categories={cats} postsPromise={postsPromise} />;
}
