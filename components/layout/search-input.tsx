"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  const go = (q: string) => {
    const next = q.trim();
    router.push(next ? `/search?q=${encodeURIComponent(next)}` : "/");
  };

  return (
    <form
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            go(value);
          }
        }}
        placeholder="Search logos, landing pages, dark UI…"
        className="h-9 rounded-full border-border/70 bg-muted/40 pl-9 focus-visible:bg-background"
      />
      <button type="submit" className="sr-only">
        Search
      </button>
    </form>
  );
}
