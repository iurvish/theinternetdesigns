"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Liquid glass, per https://aave.com/design/building-glass-for-the-web
 *
 * Three stacked jobs: a blurred+saturated backdrop (the material), an SVG
 * displacement lens that bends the backdrop hardest near the rim (refraction),
 * and CSS specular edges (light catching the bevel). Everything is driven off
 * the surface's own size so the lens curvature stays physically consistent
 * whether the chip is 30px or 112px wide.
 */

export const GLASS_DROP_SHADOW =
  "0px 12.731px 8.041px -3.35px rgba(0,0,0,0.01), 0px 4.02px 8.041px -3.35px rgba(0,0,0,0.02), 0px 2.01px 2.01px -1.005px rgba(0,0,0,0.01), 0px 1.34px 1.34px -0.67px rgba(0,0,0,0.01), 0px 0.335px 0.335px 0px rgba(0,0,0,0.02), 0px 0px 0px 0.503px rgba(0,0,0,0.06), 0px 8px 24px -8px rgba(0,0,0,0.35)";

const mapCache = new Map<string, string>();

function roundedRectSdf(
  px: number,
  py: number,
  hw: number,
  hh: number,
  r: number,
) {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  return (
    Math.min(Math.max(qx, qy), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
    r
  );
}

/**
 * Displacement map: red encodes X offset, green Y, 128 is a no-op.
 * The gradient of the rounded-rect SDF gives the surface normal, so light
 * bends outward from the rim exactly like a real bevelled edge.
 */
function generateLensMap(width: number, height: number, radius: number) {
  const key = `${width}x${height}r${radius}`;
  const hit = mapCache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const img = ctx.createImageData(width, height);
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(hw, hh, radius);
  // Bevel depth: the band, measured inward from the rim, where light bends.
  const depth = Math.max(4, Math.min(hw, hh) * 0.6);
  const eps = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const sdf = roundedRectSdf(px, py, hw, hh, r);

      if (sdf > 0) {
        img.data[i] = 128;
        img.data[i + 1] = 128;
        img.data[i + 2] = 128;
        img.data[i + 3] = 255;
        continue;
      }

      const inward = Math.min(-sdf, depth) / depth;
      // Smooth, convex falloff: flat in the middle, steep at the rim.
      const strength = (1 - inward) ** 2.2;

      const nx =
        roundedRectSdf(px + eps, py, hw, hh, r) -
        roundedRectSdf(px - eps, py, hw, hh, r);
      const ny =
        roundedRectSdf(px, py + eps, hw, hh, r) -
        roundedRectSdf(px, py - eps, hw, hh, r);
      const len = Math.hypot(nx, ny) || 1;

      img.data[i] = Math.max(0, Math.min(255, 128 + (nx / len) * strength * 127));
      img.data[i + 1] = Math.max(
        0,
        Math.min(255, 128 + (ny / len) * strength * 127),
      );
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL("image/png");
  mapCache.set(key, url);
  return url;
}

function useLensMap(width: number, height: number, radius: number) {
  const [map, setMap] = useState<string | null>(null);
  const dims = useMemo(
    () => ({
      w: Math.max(8, Math.round(width)),
      h: Math.max(8, Math.round(height)),
      r: Math.max(1, Math.round(radius)),
    }),
    [width, height, radius],
  );

  useEffect(() => {
    // prefers-reduced-transparency users get the flat material instead.
    if (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-transparency: reduce)").matches
    ) {
      return;
    }
    // Safari ignores SVG filter references in backdrop-filter; without this
    // guard the whole declaration is invalid there and the blur disappears.
    if (!CSS.supports("backdrop-filter", "url(#a) blur(4px)")) return;
    let alive = true;
    const id = requestAnimationFrame(() => {
      const url = generateLensMap(dims.w, dims.h, dims.r);
      if (alive && url) setMap(url);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [dims]);

  return map;
}

function GlassLayers({
  width,
  height,
  radius,
  tint,
}: {
  width: number;
  height: number;
  radius: number;
  tint: string;
}) {
  const fid = `glass-${useId().replace(/:/g, "")}`;
  const map = useLensMap(width, height, radius);
  // Refraction scales with the surface: a big pill bends more than a chip.
  const scale = Math.max(8, Math.min(width, height) * 0.35);

  return (
    <>
      {map ? (
        <svg aria-hidden className="absolute size-0">
          <defs>
            <filter
              id={fid}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              {/* User-space pixels: the filter region's origin is the element's
                  top-left, so the lens lines up with the chip exactly. */}
              <feImage
                href={map}
                x={0}
                y={0}
                width={width}
                height={height}
                preserveAspectRatio="none"
                result="map"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={scale}
                xChannelSelector="R"
                yChannelSelector="G"
                result="bent"
              />
              {/* Chromatic fringe: R and B refract at slightly different angles. */}
              <feOffset in="bent" dx="0.7" dy="0" result="rShift" />
              <feOffset in="bent" dx="-0.7" dy="0" result="bShift" />
              <feColorMatrix
                in="rShift"
                type="matrix"
                values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="rOnly"
              />
              <feColorMatrix
                in="bShift"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                result="bOnly"
              />
              <feBlend in="bent" in2="rOnly" mode="screen" result="rMix" />
              <feBlend in="rMix" in2="bOnly" mode="screen" />
            </filter>
          </defs>
        </svg>
      ) : null}

      {/* The material: refracted, blurred, saturated backdrop. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          borderRadius: radius,
          ...(map
            ? {
                backdropFilter: `url(#${fid}) blur(6px) saturate(1.6) brightness(1.05)`,
              }
            : {
                backdropFilter: "blur(10px) saturate(1.7) brightness(1.05)",
                WebkitBackdropFilter: "blur(10px) saturate(1.7) brightness(1.05)",
              }),
        }}
      />

      {/* Tint — dark enough that white icons stay legible over any frame. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ borderRadius: radius, background: tint }}
      />

      {/* Specular bevel: bright top edge, soft inner glow, hairline rim. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.45), inset 0 -1px 0 0 rgba(255,255,255,0.12), inset 0 0 12px 0 rgba(255,255,255,0.18), inset 0 0 0 0.5px rgba(255,255,255,0.22)",
        }}
      />
    </>
  );
}

const DEFAULT_TINT =
  "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 45%, rgba(0,0,0,0.10) 100%), rgba(20,20,22,0.34)";

type GlassGeometry = {
  width: number;
  height: number;
  radius: number;
  /** Override the fill; keep it translucent or refraction disappears. */
  tint?: string;
};

export function GlassSurface({
  children,
  className,
  width,
  height,
  radius,
  tint = DEFAULT_TINT,
  style,
}: GlassGeometry & {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("relative isolate overflow-hidden", className)}
      style={{ borderRadius: radius, boxShadow: GLASS_DROP_SHADOW, ...style }}
    >
      <GlassLayers
        width={width}
        height={height}
        radius={radius}
        tint={tint}
      />
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

export function GlassButton({
  children,
  className,
  width,
  height,
  radius,
  tint = DEFAULT_TINT,
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & GlassGeometry) {
  return (
    <button
      {...props}
      type="button"
      className={cn(
        "relative isolate overflow-hidden text-white outline-none",
        "transition-transform duration-100 ease-out",
        "active:scale-[0.94] motion-reduce:active:scale-100",
        "focus-visible:ring-2 focus-visible:ring-white/80",
        className,
      )}
      style={{ borderRadius: radius, boxShadow: GLASS_DROP_SHADOW, ...style }}
    >
      <GlassLayers
        width={width}
        height={height}
        radius={radius}
        tint={tint}
      />
      <span className="relative z-10 flex size-full items-center justify-center">
        {children}
      </span>
    </button>
  );
}
