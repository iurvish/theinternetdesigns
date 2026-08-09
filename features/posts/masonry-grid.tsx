"use client";

import {
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import type { PostListItem } from "./queries";

const SM = 640;
const MD = 768;

function getFeedColumnCount(): number {
  if (typeof window === "undefined") return 1;
  const w = window.innerWidth;
  if (w >= MD) return 3;
  if (w >= SM) return 2;
  return 1;
}

function subscribeFeedColumns(onStoreChange: () => void) {
  const mqSm = window.matchMedia(`(min-width: ${SM}px)`);
  const mqMd = window.matchMedia(`(min-width: ${MD}px)`);
  mqSm.addEventListener("change", onStoreChange);
  mqMd.addEventListener("change", onStoreChange);
  return () => {
    mqSm.removeEventListener("change", onStoreChange);
    mqMd.removeEventListener("change", onStoreChange);
  };
}

/** Width / height — matches MasonryCard fallbacks. */
export function postAspectRatioValue(post: PostListItem, index: number): number {
  if (post.thumbnail?.width && post.thumbnail?.height) {
    return post.thumbnail.width / post.thumbnail.height;
  }
  if (index % 3 === 0) return 720 / 900;
  if (index % 3 === 1) return 1;
  return 1066 / 720;
}

/**
 * True after hydration. Until then we paint static row-first masonry at every
 * breakpoint (via CSS), so the first paint already matches the final order.
 */
export function useMasonryReady(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Live column count — meaningful after `useMasonryReady()` is true. */
export function useMasonryLayout(): number {
  return useSyncExternalStore(
    subscribeFeedColumns,
    getFeedColumnCount,
    () => 1,
  );
}

/**
 * Pinterest-style shortest-column packing; first row pinned left→right so new
 * posts sit side by side on the top row.
 */
export function assignMasonryColumns(
  aspectRatios: number[],
  columnCount: number,
): number[] {
  if (columnCount <= 0) return aspectRatios.map(() => 0);

  const heights = Array.from({ length: columnCount }, () => 0);
  const assignment: number[] = [];

  for (let i = 0; i < aspectRatios.length; i++) {
    const ar = aspectRatios[i] || 1;
    const unitHeight = 1 / ar;

    let col: number;
    if (i < columnCount) {
      // Newest posts: fill the top row left → right.
      col = i;
    } else {
      col = 0;
      for (let c = 1; c < columnCount; c++) {
        if (heights[c]! < heights[col]!) col = c;
      }
    }

    assignment.push(col);
    heights[col]! += unitHeight;
  }

  return assignment;
}

export function bucketByMasonryColumns(
  aspectRatios: number[],
  columnCount: number,
): number[][] {
  const assignment = assignMasonryColumns(aspectRatios, columnCount);
  const buckets = Array.from({ length: columnCount }, () => [] as number[]);
  for (let i = 0; i < assignment.length; i++) {
    buckets[assignment[i]!]!.push(i);
  }
  return buckets;
}

export function MasonryGrid({
  className,
  columnCount,
  columns,
}: {
  className?: string;
  columnCount: number;
  columns: ReactNode[][];
}) {
  return (
    <div className={cn("flex w-full items-start gap-2.5", className)}>
      {columns.slice(0, columnCount).map((items, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-2.5">
          {items}
        </div>
      ))}
    </div>
  );
}

export function useMasonryBuckets(aspectRatios: number[], columnCount: number) {
  return useMemo(
    () => bucketByMasonryColumns(aspectRatios, columnCount),
    [aspectRatios, columnCount],
  );
}

/** Buckets for every breakpoint — same algorithm as the interactive grid. */
export function useResponsiveMasonryBuckets(aspectRatios: number[]) {
  const one = useMasonryBuckets(aspectRatios, 1);
  const two = useMasonryBuckets(aspectRatios, 2);
  const three = useMasonryBuckets(aspectRatios, 3);
  return { one, two, three };
}
