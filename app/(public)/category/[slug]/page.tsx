import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { PostGrid } from "@/features/posts/post-grid";
import { getPostsByCategory } from "@/features/posts/queries";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [cat] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  if (!cat) notFound();
  const posts = await getPostsByCategory(slug, { limit: 120 });

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Category
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">{cat.name}</h1>
        {cat.description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{cat.description}</p>
        ) : null}
      </div>
      <PostGrid posts={posts} />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [cat] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  if (!cat) return {};
  return {
    title: cat.name,
    description: cat.description ?? `Design inspiration in ${cat.name} from X.`,
  };
}
