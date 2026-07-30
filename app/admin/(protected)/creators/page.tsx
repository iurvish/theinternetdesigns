import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { creators } from "@/lib/db/schema";

export default async function AdminCreatorsPage() {
  const rows = await db.select().from(creators).orderBy(asc(creators.username));
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Creators</h1>
      <div className="rounded-2xl border border-border/60 bg-card">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No creators yet.</div>
        ) : (
          rows.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between border-b border-border/60 px-4 py-3 last:border-b-0"
            >
              <div>
                <div className="text-sm font-medium">{c.displayName}</div>
                <div className="text-xs text-muted-foreground">@{c.username}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const metadata = { title: "Creators" };
