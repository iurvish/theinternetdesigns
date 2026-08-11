import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyPostTags } from "@/lib/ai/classify-post-tags";
import { ensurePublicCategories } from "@/lib/db/ensure-public-categories";
import { ensureIndustries } from "@/lib/db/ensure-industries";
import { ensureStyles } from "@/lib/db/ensure-styles";

export const runtime = "nodejs";
export const maxDuration = 300;

type ClassifyItem = {
  sourceId: string;
  imageUrl: string;
  caption?: string;
};

export type ClassifyStreamEvent =
  | {
      type: "result";
      sourceId: string;
      ok: true;
      categoryIds: string[];
      industryIds: string[];
      styleIds: string[];
      categorySlugs: string[];
      industrySlugs: string[];
      styleSlugs: string[];
    }
  | {
      type: "result";
      sourceId: string;
      ok: false;
      error: string;
    }
  | { type: "done"; ok: number; fail: number };

const CONCURRENCY = 3;

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let items: ClassifyItem[];
  try {
    const body = (await request.json()) as { items?: ClassifyItem[] };
    items = Array.isArray(body.items) ? body.items : [];
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (items.length === 0) {
    return new Response(JSON.stringify({ error: "No items to classify." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (items.length > 50) {
    return new Response(
      JSON.stringify({ error: "Max 50 posts per AI batch." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  for (const item of items) {
    if (!item?.sourceId || !item?.imageUrl) {
      return new Response(
        JSON.stringify({ error: "Each item needs sourceId and imageUrl." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const [categories, industries, styles] = await Promise.all([
    ensurePublicCategories(),
    ensureIndustries(),
    ensureStyles(),
  ]);
  const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const indBySlug = new Map(industries.map((i) => [i.slug, i.id]));
  const styleBySlug = new Map(styles.map((s) => [s.slug, s.id]));

  const encoder = new TextEncoder();
  let okCount = 0;
  let failCount = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: ClassifyStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      let cursor = 0;
      async function worker() {
        while (cursor < items.length) {
          const index = cursor++;
          const item = items[index]!;
          try {
            const { categorySlugs, industrySlugs, styleSlugs } =
              await classifyPostTags({
                imageUrl: item.imageUrl,
                caption: item.caption?.trim() || undefined,
              });

            const categoryIds = categorySlugs
              .slice(0, 1)
              .map((s) => catBySlug.get(s))
              .filter((id): id is string => Boolean(id));
            const industryIds = industrySlugs
              .map((s) => indBySlug.get(s))
              .filter((id): id is string => Boolean(id));
            const styleIds = styleSlugs
              .map((s) => styleBySlug.get(s))
              .filter((id): id is string => Boolean(id));

            if (
              categoryIds.length === 0 &&
              industryIds.length === 0 &&
              styleIds.length === 0
            ) {
              failCount++;
              write({
                type: "result",
                sourceId: item.sourceId,
                ok: false,
                error:
                  "AI returned tags that are not in our lists — pick them manually.",
              });
              continue;
            }

            okCount++;
            write({
              type: "result",
              sourceId: item.sourceId,
              ok: true,
              categoryIds,
              industryIds,
              styleIds,
              categorySlugs: categorySlugs.slice(0, 1),
              industrySlugs,
              styleSlugs,
            });
          } catch (err) {
            failCount++;
            write({
              type: "result",
              sourceId: item.sourceId,
              ok: false,
              error:
                err instanceof Error ? err.message : "AI classification failed.",
            });
          }
        }
      }

      const workers = Array.from(
        { length: Math.min(CONCURRENCY, items.length) },
        () => worker(),
      );
      await Promise.all(workers);
      write({ type: "done", ok: okCount, fail: failCount });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
