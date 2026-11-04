"use client";

import Image from "next/image";
import { useEffect, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SITE_NAME } from "@/lib/site-config";
import { ColorSearch } from "@/features/posts/color-search";
import { SearchTrigger } from "@/features/posts/search-command";
import type { ActiveSearch } from "@/features/posts/search-filter";
import type { FeedSurface } from "@/features/posts/queries";

export const SIDEBAR_WIDTH = "16rem";

const GITHUB_REPO_URL = "https://github.com/iurvish/theinternetdesigns";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/35";

/**
 * The rail's right edge, as a 1px column rather than a border: it carries the
 * line colour at its middle and fades to the background at both ends, so the
 * rule reads as a soft seam instead of a hard full-height cut. A plain
 * `border-r` can't do this — borders take a single colour.
 *
 * The two inner stops (28% / 72%) keep a real run of solid line through the
 * middle; a pure three-stop gradient spends the whole height ramping and the
 * seam never looks committed. Both ends land on the shell colour, so the rule
 * dissolves into the background rather than stopping.
 */
function RailEdge() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[linear-gradient(to_bottom,var(--color-shell)_0%,var(--color-line)_28%,var(--color-line)_72%,var(--color-shell)_100%)]"
    />
  );
}

/** Spatial things spring; colour and opacity take a quick ease. */
const DRAWER_SPRING = { type: "spring", duration: 0.42, bounce: 0.08 } as const;
const FADE = { duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const;
/**
 * The marker travels between rows, so it springs. Low bounce and a short
 * duration: it is a frequently-seen affordance, and anything springier reads
 * as a toy the fifth time you see it.
 */
const MARKER_SPRING = { type: "spring", duration: 0.38, bounce: 0.18 } as const;
const MARKER_ID = "sidebar-nav-marker";

/**
 * Designs and Websites are different kinds of thing, not two filters over one
 * pile: a website entry has a live URL and opens a framed preview, a design is
 * media and opens the lightbox. So the first two switch `surface`, and only
 * the design surface has categories to narrow with.
 */
export const SIDEBAR_NAV: {
  label: string;
  surface?: FeedSurface;
  category?: string;
  /** No surface behind it yet — rendered, but inert and labelled. */
  soon?: boolean;
}[] = [
  { label: "Designs", surface: "designs", category: "all" },
  { label: "Websites", surface: "websites", category: "all" },
  { label: "App Screenshots", soon: true },
];

/**
 * Text-only rows: no icon, no pill, no fill. Selection is carried by ink
 * colour plus a marker that trails the label, so nothing about the row's box
 * changes — weight and position stay put and the rows below can't be nudged.
 *
 * The marker sits 0.625rem after the text rather than pinned to the right
 * edge, so it stays tied to the word it marks and travels diagonally between
 * rows of different label widths.
 *
 * `markerId` is per-instance: the rail and the drawer can both be mounted, and
 * sharing one id would make Motion morph the marker between two trees that are
 * in different places on screen.
 */
function NavRow({
  label,
  active,
  onClick,
  markerId,
  sheet,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  markerId: string;
  sheet?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        // 2.25rem tall and the full width of the rail, so the hit area clears
        // the desktop floor without a bleeding pseudo-element. On the phone
        // sheet it's a thumb target, so it gets more.
        "group flex w-full items-center gap-2.5 rounded-lg px-2 text-left font-medium tracking-tight",
        sheet ? "h-12 text-[1.0625rem]" : "h-9 text-sm",
        "transition-colors duration-150 ease-out",
        FOCUS,
        active ? "text-ink" : "text-ink-2 hover:text-ink",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {/* Marker only on the selected row. Hover is carried by the ink colour
          alone — a ghost marker on hover made every row look half-selected. */}
      {active ? (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center",
            sheet ? "size-2.5" : "size-2",
          )}
        >
          <motion.span
            layoutId={markerId}
            transition={MARKER_SPRING}
            className={cn(
              "rounded-[0.125rem] bg-ink",
              sheet ? "size-2" : "size-1.5",
            )}
            aria-hidden
          />
        </span>
      ) : null}
    </button>
  );
}

/**
 * A nav item with nothing behind it yet. Rendered rather than hidden so the
 * shape of the product is visible, but inert and labelled — an item that
 * silently does nothing is worse than one that says so.
 */
function SoonRow({ label, sheet }: { label: string; sheet?: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 px-2 font-medium tracking-tight text-ink-4",
        sheet ? "h-12 text-[1.0625rem]" : "h-9 text-sm",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 rounded-md bg-chip px-1.5 py-0.5 text-[0.625rem] font-medium tracking-tight text-ink-2">
        Soon
      </span>
    </div>
  );
}

export function SidebarContent({
  activeSurface,
  activeCategory,
  onSelect,
  search,
  onOpenSearch,
  onClearSearch,
  onNavigate,
  headerTrailing,
  markerId = MARKER_ID,
  colors,
  onColors,
  sheet,
}: {
  activeSurface: FeedSurface;
  activeCategory: string;
  onSelect: (surface: FeedSurface, category: string) => void;
  search: ActiveSearch | null;
  onOpenSearch: () => void;
  onClearSearch: () => void;
  colors: string[];
  onColors: (next: string[]) => void;
  /** Fired after any choice, so the mobile drawer can dismiss itself. */
  onNavigate?: () => void;
  /** Sits at the end of the brand row — the drawer's close button goes here
   *  rather than floating over the title. */
  headerTrailing?: ReactNode;
  /** Distinct per mounted sidebar; see `NavRow`. */
  markerId?: string;
  /** Full-screen mobile sheet rather than the desktop rail. */
  sheet?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        sheet ? "px-5 pb-6 pt-4" : "px-3 py-3.5",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2",
          sheet ? "h-12" : "h-9 px-1",
        )}
      >
        <Image
          src="/favicon-96x96.png"
          alt=""
          width={32}
          height={32}
          className={cn(
            "shrink-0 rounded-md object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.06)]",
            sheet ? "size-8" : "size-[1.625rem]",
          )}
          priority
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium tracking-tight text-ink",
            sheet ? "text-base" : "text-sm",
          )}
        >
          {SITE_NAME}
        </span>
        {headerTrailing}
      </div>

      {/* Searching by word and searching by colour are the same job, so they
          share a row. It also gets the colour picker out of the chip rail,
          which needs every pixel to keep the categories on one line. */}
      <div
        className={cn(
          "flex shrink-0 items-stretch gap-1.5",
          sheet ? "mt-6" : "mt-3.5",
        )}
      >
        <SearchTrigger
          active={search}
          onOpen={onOpenSearch}
          onClear={onClearSearch}
          size={sheet ? "lg" : "sm"}
          className="min-w-0 flex-1"
        />
        <ColorSearch
          selected={colors}
          onSelected={onColors}
          size={sheet ? "lg" : "sm"}
        />
      </div>

      <nav
        className={cn("flex shrink-0 flex-col", sheet ? "mt-6" : "mt-4")}
        aria-label="Browse"
      >
        <LayoutGroup id={markerId}>
          {SIDEBAR_NAV.map(({ label, surface, category, soon }) =>
            soon || !surface || !category ? (
              <SoonRow key={label} label={label} sheet={sheet} />
            ) : (
              <NavRow
                key={label}
                label={label}
                markerId={markerId}
                sheet={sheet}
                active={
                  activeSurface === surface && activeCategory === category
                }
                onClick={() => {
                  onSelect(surface, category);
                  onNavigate?.();
                }}
              />
            ),
          )}
        </LayoutGroup>

        {/* Short dashed rule — it marks a change of kind (places to browse vs.
            people to browse), not a full section break. */}
        <div
          className="my-2 ml-2 w-[6.5rem] border-t border-dashed border-line"
          aria-hidden
        />

        <SoonRow label="Creators" sheet={sheet} />
      </nav>

      <div className="min-h-6 flex-1" />

      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "flex shrink-0 items-center rounded-lg px-2 font-medium tracking-tight text-ink-2",
          sheet ? "h-12 text-[0.9375rem]" : "h-9 text-[0.8125rem]",
          "transition-colors duration-150 ease-out hover:text-ink",
          FOCUS,
        )}
      >
        Star on GitHub
      </a>
    </div>
  );
}

/** Fixed rail, `lg` and up. Sticky rather than fixed so the page keeps the
 *  native window scrollbar instead of an inner scroller. */
export function SidebarRail({ children }: { children: ReactNode }) {
  return (
    <aside
      style={{ width: SIDEBAR_WIDTH }}
      className="sticky top-0 hidden h-dvh shrink-0 bg-shell lg:block"
    >
      <RailEdge />
      {children}
    </aside>
  );
}

export function SidebarCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close menu"
      className={cn(
        "-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-2",
        "transition-[background-color,color,transform] duration-150 ease-out",
        "hover:bg-chip hover:text-ink active:scale-[0.96] motion-reduce:active:scale-100",
        FOCUS,
      )}
    >
      <X className="size-[1.125rem]" strokeWidth={1.8} />
    </button>
  );
}

export function SidebarDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            onClick={onClose}
            className="absolute inset-0 bg-ink/25"
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={DRAWER_SPRING}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            // Full width on purpose: a half-width tray on a phone leaves a
            // strip of unusable feed behind it and reads as an accident.
            className="absolute inset-y-0 left-0 w-full bg-shell"
          >
            {children}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
