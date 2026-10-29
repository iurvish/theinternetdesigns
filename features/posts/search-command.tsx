"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Brush,
  Building2,
  Component,
  CornerDownLeft,
  LayoutGrid,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadSearchFacetsAction,
  loadSearchPreviewAction,
} from "./search-actions";
import {
  EMPTY_FACETS,
  FACET_GROUP_LABELS,
  FACET_KIND_LABELS,
  FACET_ORDER,
  type ActiveSearch,
  type FacetKind,
  type FacetPreview,
  type FacetTerm,
  type SearchFacets,
} from "./search-filter";

/* ── shared paper tokens (match the toolbar chips) ──────────────────────── */

/**
 * Same raised stack the sort control uses — the single-ring chip shadow read as
 * flat next to it, so the field looked unclickable.
 */
const CHIP_SHADOW =
  "shadow-[0_0_0_0.5px_rgba(0,0,0,0.09),0_3px_6px_-2px_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04),0_0_0_1px_rgba(232,232,232,0.6),0_3px_9px_0_rgba(0,0,0,0.02),0_1px_1px_0_rgba(0,0,0,0.04)]";

const PANEL_SHADOW =
  "shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_2px_4px_-1px_rgba(0,0,0,0.04),0_24px_48px_-12px_rgba(0,0,0,0.22),0_48px_96px_-24px_rgba(0,0,0,0.18)]";

/** Spatial surfaces get a spring; opacity gets a quick ease (repo motion vocabulary). */
const PANEL_IN = { type: "spring", duration: 0.34, bounce: 0.14 } as const;
const FADE = { duration: 0.16, ease: [0.23, 1, 0.32, 1] } as const;

const KIND_ICON: Record<FacetKind, typeof LayoutGrid> = {
  category: LayoutGrid,
  element: Component,
  style: Brush,
  industry: Building2,
};

/** Long vocabularies collapse until you type — 101 elements is a lot to arrow past. */
const IDLE_CAP: Record<FacetKind, number> = {
  // Short enough that the Categories header still peeks below the fold — if
  // elements fill the whole list, nobody learns the other groups are there.
  element: 8,
  category: 20,
  style: 20,
  industry: 10,
};

/* ── matching ───────────────────────────────────────────────────────────── */

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower is better; `null` means no match at all. */
function scoreTerm(term: FacetTerm, q: string): number | null {
  const name = norm(term.name);
  const slug = norm(term.slug);
  if (name === q || slug === q) return 0;
  if (name.startsWith(q) || slug.startsWith(q)) return 1;
  for (const alias of term.aliases) {
    const a = norm(alias);
    if (a === q) return 2;
    if (a.startsWith(q)) return 3;
  }
  if (name.includes(q) || slug.includes(q)) return 4;
  if (term.aliases.some((a) => norm(a).includes(q))) return 5;
  return null;
}

type Row =
  | { type: "text"; key: string; query: string }
  | { type: "facet"; key: string; term: FacetTerm };

type Group = { label: string; rows: Row[]; hiddenCount: number };

function buildGroups(facets: SearchFacets, rawQuery: string): Group[] {
  const q = norm(rawQuery);

  if (!q) {
    return FACET_ORDER.flatMap((kind) => {
      const terms = facets[kind];
      if (terms.length === 0) return [];
      const shown = terms.slice(0, IDLE_CAP[kind]);
      return [
        {
          label: FACET_GROUP_LABELS[kind],
          hiddenCount: terms.length - shown.length,
          rows: shown.map<Row>((term) => ({
            type: "facet",
            key: `${term.kind}:${term.slug}`,
            term,
          })),
        },
      ];
    });
  }

  const scored = FACET_ORDER.flatMap((kind) =>
    facets[kind].flatMap((term) => {
      const score = scoreTerm(term, q);
      return score === null ? [] : [{ term, score }];
    }),
  ).sort((a, b) => a.score - b.score || b.term.count - a.term.count);

  const groups: Group[] = [
    {
      label: "Search",
      hiddenCount: 0,
      rows: [{ type: "text", key: `text:${q}`, query: rawQuery.trim() }],
    },
  ];
  if (scored.length > 0) {
    groups.push({
      label: "Matching tags",
      hiddenCount: 0,
      rows: scored.slice(0, 40).map<Row>(({ term }) => ({
        type: "facet",
        key: `${term.kind}:${term.slug}`,
        term,
      })),
    });
  }
  return groups;
}

function rowToSearch(row: Row): ActiveSearch {
  if (row.type === "text") {
    return { kind: "text", query: row.query, label: row.query };
  }
  return {
    kind: row.term.kind,
    slug: row.term.slug,
    label: row.term.name,
  };
}

/* ── module-level caches (survive palette open/close) ───────────────────── */

let facetsCache: SearchFacets | null = null;
let facetsInflight: Promise<SearchFacets> | null = null;
const previewCache = new Map<string, FacetPreview>();

const previewInflight = new Map<string, Promise<FacetPreview>>();

type PreviewTarget =
  | { kind: "text"; query: string }
  | { kind: FacetKind; slug: string };

function previewTarget(row: Row): PreviewTarget {
  return row.type === "text"
    ? { kind: "text", query: row.query }
    : { kind: row.term.kind, slug: row.term.slug };
}

/**
 * One request per key, shared by the pane that's waiting on it and by the
 * speculative warm-ups around the cursor.
 */
function ensurePreview(key: string, target: PreviewTarget) {
  const hit = previewCache.get(key);
  if (hit) return Promise.resolve(hit);
  let pending = previewInflight.get(key);
  if (!pending) {
    pending = loadSearchPreviewAction(target)
      .then((result) => {
        previewCache.set(key, result);
        return result;
      })
      .finally(() => previewInflight.delete(key));
    previewInflight.set(key, pending);
  }
  return pending;
}

function loadFacets(): Promise<SearchFacets> {
  if (facetsCache) return Promise.resolve(facetsCache);
  facetsInflight ??= loadSearchFacetsAction()
    .then((f) => {
      facetsCache = f;
      return f;
    })
    .catch(() => EMPTY_FACETS)
    .finally(() => {
      facetsInflight = null;
    });
  return facetsInflight;
}

/* ── client-only probes ─────────────────────────────────────────────────── */

const noopSubscribe = () => () => {};

/** `true` once hydrated — lets portals mount without a setState-in-effect hop. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Which modifier to print in the shortcut hint. Assumes ⌘ until hydrated. */
function useIsMac(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad|iPod/.test(navigator.userAgent),
    () => true,
  );
}

/* ── trigger ────────────────────────────────────────────────────────────── */

/**
 * Toolbar search field. Reads as an input but is a button — clicking (or ⌘K)
 * opens the palette. When a search is running it becomes a removable chip, so
 * "how do I get back to everything" is always one visible click away.
 */
export function SearchTrigger({
  active,
  onOpen,
  onClear,
  className,
}: {
  active: ActiveSearch | null;
  onOpen: () => void;
  onClear: () => void;
  className?: string;
}) {
  const mac = useIsMac();

  // Warm the vocabulary after idle so the first open paints instantly.
  useEffect(() => {
    const id = window.setTimeout(() => void loadFacets(), 900);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      // No `overflow-hidden` here: the segments round themselves, and clipping
      // the box would eat the raised shadow that makes the field look pressable.
      className={cn("flex h-[38px] items-stretch gap-px rounded-xl", className)}
    >
      <button
        type="button"
        onClick={onOpen}
        onPointerEnter={() => void loadFacets()}
        aria-label={active ? `Search: ${active.label}. Change` : "Search designs"}
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(
          "group flex min-w-0 flex-1 items-center gap-2 bg-white px-3 text-left transition-colors",
          active ? "rounded-l-xl" : "rounded-xl",
          CHIP_SHADOW,
          "hover:bg-[#fcfcfc] active:scale-[0.995] motion-reduce:active:scale-100",
        )}
      >
        <Search
          className="size-4 shrink-0 text-[#8a8c8f] transition-colors group-hover:text-[#5c5c5e]"
          strokeWidth={1.8}
          aria-hidden
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm tracking-tight",
            active ? "font-medium text-[#1f2123]" : "text-[#8a8c8f]",
          )}
        >
          {active ? active.label : "Search designs"}
        </span>
        {active ? null : (
          <kbd className="hidden shrink-0 items-center gap-0.5 rounded-md bg-[#f2f2f2] px-1.5 py-0.5 font-sans text-[11px] font-medium text-[#8a8c8f] sm:flex">
            {mac ? "⌘" : "Ctrl"}K
          </kbd>
        )}
      </button>

      {active ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className={cn(
            "flex w-[38px] shrink-0 items-center justify-center rounded-r-xl bg-white text-[#707275] transition-colors hover:bg-[#fcfcfc] hover:text-[#1f2123] active:scale-[0.98] motion-reduce:active:scale-100",
            CHIP_SHADOW,
          )}
        >
          <X className="size-[18px]" strokeWidth={1.8} />
        </button>
      ) : null}
    </div>
  );
}

/* ── palette ────────────────────────────────────────────────────────────── */

export function SearchPalette({
  open,
  active,
  onClose,
  onSelect,
}: {
  open: boolean;
  active: ActiveSearch | null;
  onClose: () => void;
  onSelect: (search: ActiveSearch) => void;
}) {
  const mounted = useHydrated();

  return mounted
    ? createPortal(
        <AnimatePresence>
          {open ? (
            <PaletteBody active={active} onClose={onClose} onSelect={onSelect} />
          ) : null}
        </AnimatePresence>,
        document.body,
      )
    : null;
}

function PaletteBody({
  active,
  onClose,
  onSelect,
}: {
  active: ActiveSearch | null;
  onClose: () => void;
  onSelect: (search: ActiveSearch) => void;
}) {
  const [facets, setFacets] = useState<SearchFacets>(
    () => facetsCache ?? EMPTY_FACETS,
  );
  const [loadingFacets, setLoadingFacets] = useState(() => !facetsCache);
  const [query, setQuery] = useState("");
  // Cursor is stored with the query it belongs to, so a new result set resets
  // the highlight by derivation rather than by a second render pass.
  const [cursorAt, setCursorAt] = useState({ query: "", index: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadFacets().then((f) => {
      if (cancelled) return;
      setFacets(f);
      setLoadingFacets(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => buildGroups(facets, query), [facets, query]);
  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  const cursor = cursorAt.query === query ? cursorAt.index : 0;
  const setCursor = useCallback(
    (next: number | ((prev: number) => number)) => {
      setCursorAt((prev) => {
        const from = prev.query === query ? prev.index : 0;
        return {
          query,
          index: typeof next === "function" ? next(from) : next,
        };
      });
    },
    [query],
  );

  const activeRow = rows[Math.min(cursor, rows.length - 1)] ?? null;

  const commit = useCallback(
    (row: Row | null) => {
      if (!row) return;
      onSelect(rowToSearch(row));
      onClose();
    },
    [onSelect, onClose],
  );

  /* keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        setCursor((c) => (rows.length ? (c + 1) % rows.length : 0));
        return;
      }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        setCursor((c) => (rows.length ? (c - 1 + rows.length) % rows.length : 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commit(rows[cursor] ?? rows[0] ?? null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, commit, onClose, setCursor]);

  // Warm the rows most likely to be looked at next: the one the palette lands
  // on and its immediate neighbours. Each is a cached server read, so this is
  // cheap and makes arrowing feel instant.
  useEffect(() => {
    for (const row of rows.slice(Math.max(0, cursor - 1), cursor + 3)) {
      void ensurePreview(previewKey(row), previewTarget(row));
    }
  }, [rows, cursor]);

  // Keep the highlighted row in view while arrowing.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      '[data-row-active="true"]',
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, groups]);

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // Lock the page behind the palette without a layout jump from the scrollbar.
  useEffect(() => {
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
    };
  }, []);

  let rowIndex = -1;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-3 pb-6 pt-[10vh] sm:px-6">
      <motion.div
        className="absolute inset-0 bg-[#1f2123]/25 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={FADE}
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Search designs"
        initial={{ opacity: 0, y: -10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.99, transition: FADE }}
        transition={{ y: PANEL_IN, scale: PANEL_IN, opacity: FADE }}
        className={cn(
          "relative flex w-full max-w-[860px] flex-col overflow-hidden rounded-2xl bg-white",
          // Phones have no preview pane to fill, so the panel hugs its rows
          // instead of reserving half a screen of white space.
          "max-h-[calc(100dvh-14vh-1.5rem)] sm:h-[min(560px,calc(100dvh-14vh-1.5rem))]",
          PANEL_SHADOW,
        )}
      >
        {/* Query row */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[#ececee] px-4 py-3.5">
          <Search
            className="size-[18px] shrink-0 text-[#8a8c8f]"
            strokeWidth={1.8}
            aria-hidden
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search designs, or jump to a category"
            spellCheck={false}
            autoComplete="off"
            aria-label="Search designs"
            className="min-w-0 flex-1 bg-transparent text-[15px] tracking-tight text-[#1f2123] outline-none placeholder:text-[#a0a2a5]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear query"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f2f2f2] text-[#707275] transition-colors hover:bg-[#e8e8ea] hover:text-[#1f2123]"
            >
              <X className="size-3.5" strokeWidth={2.2} />
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded-md bg-[#f2f2f2] px-1.5 py-0.5 font-sans text-[11px] font-medium text-[#8a8c8f] sm:block">
              esc
            </kbd>
          )}
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          <div
            ref={listRef}
            role="listbox"
            aria-label="Search results"
            className="min-h-0 w-full overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin] sm:w-[320px] sm:shrink-0 sm:border-r sm:border-[#ececee]"
          >
            {loadingFacets && rows.length === 0 ? (
              <ListSkeleton />
            ) : rows.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[#8a8c8f]">
                Nothing matches that yet.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="mb-1.5 last:mb-0">
                  <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[#a0a2a5]">
                    {group.label}
                  </div>
                  {group.rows.map((row) => {
                    rowIndex += 1;
                    const index = rowIndex;
                    return (
                      <PaletteRow
                        key={row.key}
                        row={row}
                        active={index === cursor}
                        onHover={() => setCursor(index)}
                        onClick={() => commit(row)}
                      />
                    );
                  })}
                  {group.hiddenCount > 0 ? (
                    <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-[#b0b2b5]">
                      +{group.hiddenCount} more — start typing to find them
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="hidden min-h-0 flex-1 sm:block">
            <PreviewPane
              row={activeRow}
              onCommit={() => commit(activeRow)}
              isCurrent={
                activeRow !== null &&
                active !== null &&
                sameSearch(rowToSearch(activeRow), active)
              }
            />
          </div>
        </div>

        {/* Footer hints */}
        <div className="flex shrink-0 items-center gap-4 border-t border-[#ececee] bg-[#fafafa] px-4 py-2.5 text-[11px] text-[#8a8c8f]">
          {/* Key hints are noise on touch — the count is the useful half. */}
          <span className="hidden items-center gap-4 sm:flex">
            <Hint keys={["↑", "↓"]}>to navigate</Hint>
            <Hint icon={<CornerDownLeft className="size-3" strokeWidth={2} />}>
              to select
            </Hint>
            <Hint keys={["esc"]}>to close</Hint>
          </span>
          <span className="ml-auto">
            {rows.length} {rows.length === 1 ? "result" : "results"}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

function sameSearch(a: ActiveSearch, b: ActiveSearch): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "text" && b.kind === "text"
    ? a.query.trim().toLowerCase() === b.query.trim().toLowerCase()
    : "slug" in a && "slug" in b && a.slug === b.slug;
}

function Hint({
  keys,
  icon,
  children,
}: {
  keys?: string[];
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {icon ? (
        <kbd className="flex size-5 items-center justify-center rounded border border-[#e3e5e8] bg-white font-sans text-[#707275]">
          {icon}
        </kbd>
      ) : null}
      {keys?.map((k) => (
        <kbd
          key={k}
          className="flex h-5 min-w-5 items-center justify-center rounded border border-[#e3e5e8] bg-white px-1 font-sans text-[11px] text-[#707275]"
        >
          {k}
        </kbd>
      ))}
      {children}
    </span>
  );
}

function PaletteRow({
  row,
  active,
  onHover,
  onClick,
}: {
  row: Row;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const Icon = row.type === "text" ? Search : KIND_ICON[row.term.kind];

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-row-active={active}
      onPointerEnter={() => void ensurePreview(previewKey(row), previewTarget(row))}
      onPointerMove={onHover}
      onFocus={onHover}
      onClick={onClick}
      className={cn(
        "flex w-full scroll-mt-9 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100",
        active ? "bg-[#f2f2f3]" : "bg-transparent",
      )}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
          active ? "bg-white text-[#1f2123] shadow-sm" : "text-[#9a9c9f]",
        )}
      >
        <Icon className="size-[15px]" strokeWidth={1.8} aria-hidden />
      </span>
      {row.type === "text" ? (
        <span className="min-w-0 flex-1 truncate text-sm tracking-tight text-[#1f2123]">
          Search for{" "}
          <span className="font-medium">&ldquo;{row.query}&rdquo;</span>
        </span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm tracking-tight text-[#1f2123]">
            {row.term.name}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-[#a0a2a5]">
            {row.term.count}
          </span>
        </>
      )}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg bg-[#f2f2f3]"
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
}

/* ── preview pane ───────────────────────────────────────────────────────── */

function previewKey(row: Row): string {
  return row.type === "text"
    ? `text:${row.query.trim().toLowerCase()}`
    : `${row.term.kind}:${row.term.slug}`;
}

function PreviewPane({
  row,
  onCommit,
  isCurrent,
}: {
  row: Row | null;
  onCommit: () => void;
  isCurrent: boolean;
}) {
  const key = row ? previewKey(row) : "";
  // Results land in a module-level cache, so arrowing back to a row you have
  // already seen paints from render instead of re-fetching.
  const [, setFetchCount] = useState(0);
  const preview = key ? (previewCache.get(key) ?? null) : null;

  useEffect(() => {
    if (!row || previewCache.has(key)) return;
    // Short debounce so holding ↓ doesn't queue a request per row. The warm-up
    // around the cursor usually has this in flight already, and `ensurePreview`
    // shares it rather than asking twice.
    let cancelled = false;
    const target = previewTarget(row);
    const timer = window.setTimeout(() => {
      void ensurePreview(key, target).then(() => {
        if (!cancelled) setFetchCount((n) => n + 1);
      });
    }, 70);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, row]);

  if (!row) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-[#a0a2a5]">
        Pick something on the left to preview it.
      </div>
    );
  }

  const title = row.type === "text" ? row.query : row.term.name;
  const eyebrow =
    row.type === "text" ? "Full search" : FACET_KIND_LABELS[row.term.kind];
  const total =
    preview?.total ?? (row.type === "facet" ? row.term.count : null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa] p-3 [scrollbar-width:thin]">
        <AnimatePresence mode="wait">
          <motion.div
            key={key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            // Fixed tile ratio rather than fixed rows: a tag with two designs
            // shows two tiles, not two tiles and four holes.
            className="grid grid-cols-3 content-start gap-2"
          >
            {!preview
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[4/3] animate-pulse rounded-lg bg-[#efeff1]"
                  />
                ))
              : preview.tiles.length === 0 ? (
                  <div className="col-span-3 flex h-[180px] items-center justify-center rounded-lg border border-dashed border-[#e3e5e8] text-sm text-[#a0a2a5]">
                    No designs to preview
                  </div>
                ) : (
                  preview.tiles.map((tile) => (
                    <div
                      key={tile.id}
                      className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[#ededef] ring-1 ring-inset ring-black/[0.06]"
                    >
                      <Image
                        src={tile.url}
                        alt=""
                        fill
                        sizes="180px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ))
                )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="shrink-0 border-t border-[#ececee] px-4 py-3.5">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#a0a2a5]">
          {eyebrow}
        </p>
        <h3 className="mt-1 truncate text-[15px] font-semibold tracking-tight text-[#1f2123]">
          {title || "Everything"}
        </h3>
        <p className="mt-0.5 text-xs text-[#8a8c8f]">
          {total === null
            ? " "
            : `${total}${total >= 60 && row.type === "text" ? "+" : ""} ${
                total === 1 ? "design" : "designs"
              }`}
        </p>
        <button
          type="button"
          onClick={onCommit}
          className="group mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1f2123] text-sm font-medium tracking-tight text-white shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.14)] transition-[transform,background-color] hover:bg-[#2a2c2e] active:scale-[0.98] motion-reduce:active:scale-100"
        >
          {isCurrent ? "Showing in feed" : "Show in feed"}
          <ArrowRight
            className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none"
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </div>
    </div>
  );
}
