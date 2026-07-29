import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminSignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Login page skips the guard by rendering its own layout branch.
  const h = await headers();
  const pathname = h.get("x-invoke-path") ?? h.get("next-url") ?? "";
  const isLogin = pathname.startsWith("/admin/login");

  if (!isLogin) await requireAdmin();

  return (
    <div className="flex min-h-screen bg-muted/30">
      {!isLogin ? (
        <aside className="hidden w-56 shrink-0 border-r border-border/60 bg-background p-4 md:block">
          <Link href="/admin" className="mb-6 flex items-center gap-2 text-sm font-semibold">
            idesigns · admin
          </Link>
          <nav className="flex flex-col gap-1 text-sm">
            <AdminNavLink href="/admin">Dashboard</AdminNavLink>
            <AdminNavLink href="/admin/new">New post</AdminNavLink>
            <AdminNavLink href="/admin/posts">Posts</AdminNavLink>
            <AdminNavLink href="/admin/categories">Categories</AdminNavLink>
            <AdminNavLink href="/admin/creators">Creators</AdminNavLink>
          </nav>
          <div className="mt-8 border-t border-border/60 pt-4">
            <AdminSignOutButton />
          </div>
        </aside>
      ) : null}
      <div className="flex-1">{children}</div>
    </div>
  );
}

function AdminNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </Link>
  );
}
