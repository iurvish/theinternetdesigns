import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

// TODO(perf): Once real content is being ingested, switch to opt-in `use cache`
// (Next.js 16 Cache Components) with per-page cache tags so we don't force-dynamic
// the whole public shell. For now, force-dynamic keeps the build honest.
export const dynamic = "force-dynamic";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
