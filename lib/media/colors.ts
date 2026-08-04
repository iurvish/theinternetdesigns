import sharp from "sharp";

/** One entry of an image's dominant-colour palette. */
export type PaletteColor = {
  /** Lowercase `#rrggbb`. */
  hex: string;
  r: number;
  g: number;
  b: number;
  /** Share of the palette, 0–100, rounded. The chosen colours sum to ~100. */
  percent: number;
};

/** Analyse at most this many pixels — plenty for a stable palette, and fast. */
const SAMPLE_EDGE = 96;
/** Channel step for the initial histogram (16 levels per channel). */
const QUANT = 16;
/** Buckets whose centres are closer than this (RGB Euclidean) get merged. */
const MERGE_DIST = 60;
const MERGE_DIST_SQ = MERGE_DIST * MERGE_DIST;

type Cluster = { count: number; rSum: number; gSum: number; bSum: number };

function clusterCentre(c: Cluster) {
  return {
    r: c.rSum / c.count,
    g: c.gSum / c.count,
    b: c.bSum / c.count,
  };
}

function toHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Extract the dominant colours of an image with usage percentages.
 *
 * Runs entirely in-process on the pixel buffer sharp already decodes — no
 * external service. Transparent areas are flattened onto white first (designs
 * are usually shown on light), then pixels are histogrammed on a coarse grid
 * and agglomeratively merged so near-identical shades (gradients, anti-aliasing)
 * collapse into one swatch.
 */
export async function extractPalette(
  input: Buffer,
  count = 4,
): Promise<PaletteColor[]> {
  let data: Buffer;
  try {
    const raw = await sharp(input, { failOn: "none" })
      .resize(SAMPLE_EDGE, SAMPLE_EDGE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .raw()
      .toBuffer();
    data = raw;
  } catch {
    return [];
  }

  // 1. Histogram on a coarse grid, keeping exact sums per bucket for averaging.
  const buckets = new Map<number, Cluster>();
  let total = 0;
  for (let i = 0; i + 2 < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key =
      (Math.floor(r / QUANT) << 10) |
      (Math.floor(g / QUANT) << 5) |
      Math.floor(b / QUANT);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.rSum += r;
      bucket.gSum += g;
      bucket.bSum += b;
    } else {
      buckets.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
    }
    total++;
  }
  if (total === 0) return [];

  // 2. Greedily merge buckets (most-frequent first) into perceptually-close clusters.
  const ordered = [...buckets.values()].sort((a, b) => b.count - a.count);
  const clusters: Cluster[] = [];
  for (const bucket of ordered) {
    const bc = clusterCentre(bucket);
    let merged = false;
    for (const cluster of clusters) {
      const cc = clusterCentre(cluster);
      const dr = bc.r - cc.r;
      const dg = bc.g - cc.g;
      const db = bc.b - cc.b;
      if (dr * dr + dg * dg + db * db <= MERGE_DIST_SQ) {
        cluster.count += bucket.count;
        cluster.rSum += bucket.rSum;
        cluster.gSum += bucket.gSum;
        cluster.bSum += bucket.bSum;
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push({ ...bucket });
  }

  // 3. Take the top `count`, normalise their shares to sum to ~100.
  const top = clusters.sort((a, b) => b.count - a.count).slice(0, count);
  const shown = top.reduce((sum, c) => sum + c.count, 0);
  return top.map((c) => {
    const { r, g, b } = clusterCentre(c);
    const rr = Math.round(r);
    const gg = Math.round(g);
    const bb = Math.round(b);
    return {
      hex: toHex(rr, gg, bb),
      r: rr,
      g: gg,
      b: bb,
      percent: Math.round((c.count / shown) * 100),
    };
  });
}
