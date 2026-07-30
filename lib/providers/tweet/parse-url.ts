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
