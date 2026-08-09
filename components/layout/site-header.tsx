import Link from "next/link";
import { SearchInput } from "@/components/layout/search-input";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-foreground"
        >
          idesigns
        </Link>
        <div className="ml-auto flex flex-1 items-center justify-end gap-3 md:flex-none md:w-96">
          <SearchInput />
        </div>
      </div>
    </header>
  );
}
