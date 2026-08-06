import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, creators, posts } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getFeedAutoplay } from "@/lib/settings";
import { FeedAutoplayToggle } from "./feed-autoplay-toggle";

export default async function AdminDashboard() {
  const [{ count: postCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(posts);
  const [{ count: creatorCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creators);
  const [{ count: categoryCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories);
  const feedAutoplay = await getFeedAutoplay();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Link href="/admin/new" className={buttonVariants()}>
          New post
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Posts" value={postCount} />
        <StatCard label="Creators" value={creatorCount} />
        <StatCard label="Categories" value={categoryCount} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <FeedAutoplayToggle initial={feedAutoplay} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export const metadata = { title: "Admin" };
