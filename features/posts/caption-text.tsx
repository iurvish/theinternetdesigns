"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cleanCaptionForDisplay } from "@/lib/providers/tweet/clean-caption";

const URL_RE =
  /https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+/gi;

function stripTrailingPunct(raw: string) {
  return raw.replace(/[),.!?;:]+$/g, "");
}

function displayDomain(raw: string) {
  try {
    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    const host = new URL(href).hostname.replace(/^www\./i, "");
    return host;
  } catch {
    return raw;
  }
}

function toHref(raw: string) {
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

function normalizeUrl(raw: string) {
  try {
    const href = toHref(raw);
    const u = new URL(href);
    u.hash = "";
    // Ignore trailing slash differences on status URLs.
    return u.href.replace(/\/$/, "");
  } catch {
    return raw;
  }
}

/** Renders caption text with URLs as blue domain names (Figma 58:2608). */
export function CaptionText({
  text,
  className,
  /** Never turn these into blue links (e.g. the post's own sourceUrl). */
  excludeUrls,
}: {
  text: string;
  className?: string;
  excludeUrls?: string[];
}) {
  // Drop Twitter's auto-appended trailing media shortlink before linkifying.
  const cleaned = cleanCaptionForDisplay(text);
  const excluded = new Set(
    (excludeUrls ?? []).map(normalizeUrl).filter(Boolean),
  );

  const parts: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(cleaned)) !== null) {
    const raw = stripTrailingPunct(match[0]);
    const start = match.index;
    const end = start + match[0].length;
    if (start > last) {
      parts.push(cleaned.slice(last, start));
    }
    const trailing = match[0].slice(raw.length);
    if (excluded.has(normalizeUrl(raw))) {
      // Drop the post permalink if it leaked into caption text — never show it
      // as a blue caption link (Source row already covers that).
      last = end;
      continue;
    }
    parts.push(
      <a
        key={`link-${key++}`}
        href={toHref(raw)}
        target="_blank"
        rel="noreferrer"
        className="text-[#0e8ce2] underline-offset-2 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {displayDomain(raw)}
      </a>,
    );
    if (trailing) parts.push(trailing);
    last = end;
  }

  if (last < cleaned.length) parts.push(cleaned.slice(last));

  return (
    <p className={cn("whitespace-pre-wrap", className)}>
      {parts.length ? parts : cleaned}
    </p>
  );
}
