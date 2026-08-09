export function parseTweetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d{5,25}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (!/^(www\.)?(twitter|x)\.com$/.test(u.hostname)) return null;
    const match = u.pathname.match(/\/status(?:es)?\/(\d{5,25})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Pull every X/Twitter status id from a multi-line / pasted blob of URLs. */
export function parseTweetIds(blob: string): string[] {
  const tokens = blob
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const id = parseTweetId(token);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  // Also scan free-form text for status URLs that weren't split cleanly.
  const re = /(?:twitter|x)\.com\/[^/\s]+\/status(?:es)?\/(\d{5,25})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return ids;
}
