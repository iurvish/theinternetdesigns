const PIN_HOST =
  /^(?:(?:[a-z]{2}|www)\.)?pinterest\.(?:com|com\.(?:au|mx)|co\.uk|ca|de|fr|it|es|jp|kr|nz|ph|pt|ru|se|at|ch|cl|dk|ie|nl)(?:\.[a-z]{2})?$/i;

/** Numeric pin id, optionally preceded by a slug (`design-ideas--123456`). */
const PIN_PATH_RE = /\/pin\/(?:[^/\s]*?--)?(\d{5,25})(?:\/|$|\?|#)/i;

export function parsePinId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d{5,25}$/.test(trimmed)) return trimmed;

  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./i, "");
    if (host === "pin.it") {
      // Short links need an HTTP redirect resolve — see resolvePinId.
      return null;
    }
    if (!PIN_HOST.test(u.hostname) && !/^pinterest\./i.test(host)) {
      // Allow bare regional hosts that still carry /pin/{id}.
      if (!/pinterest\./i.test(u.hostname)) return null;
    }
    const match = u.pathname.match(PIN_PATH_RE);
    return match ? match[1] : null;
  } catch {
    const match = trimmed.match(PIN_PATH_RE);
    return match ? match[1] : null;
  }
}

/** True when the token looks like a Pinterest short link that needs resolving. */
export function isPinShortUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.hostname.replace(/^www\./i, "") === "pin.it";
  } catch {
    return false;
  }
}

/**
 * Follow pin.it (and similar) redirects to extract a numeric pin id.
 * Returns null if the redirect chain doesn't land on a pin URL.
 */
export async function resolvePinId(input: string): Promise<string | null> {
  const direct = parsePinId(input);
  if (direct) return direct;
  if (!isPinShortUrl(input)) return null;

  try {
    const res = await fetch(input.trim(), {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (idesigns)" },
      cache: "no-store",
    });
    return parsePinId(res.url) ?? parsePinId(input);
  } catch {
    return null;
  }
}

/** Pull every pin id from a pasted blob of URLs (short links resolved). */
export async function parsePinIds(blob: string): Promise<string[]> {
  const tokens = blob
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    let id = parsePinId(token);
    if (!id && isPinShortUrl(token)) {
      id = await resolvePinId(token);
    }
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  // Free-form scan for pin URLs that weren't split cleanly.
  const re =
    /(?:(?:[a-z]{2}|www)\.)?pinterest\.[^\s/]+\/pin\/(?:[^/\s]*?--)?(\d{5,25})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }

  return ids;
}
