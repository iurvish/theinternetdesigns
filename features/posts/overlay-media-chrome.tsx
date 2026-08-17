"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MorphIcon } from "morphicons/react";
import {
  Check,
  Copy,
  LoaderCircle,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide";
import { cn } from "@/lib/utils";
import { GlassButton, GlassSurface } from "./glass";
import {
  copySingleMedia,
  prefetchCopy,
  type CopyableMedia,
} from "./copy-media";

/** A material arriving — scale + blur, critically damped. */
const SURFACE_SPRING = { type: "spring", duration: 0.34, bounce: 0 } as const;

const CHROME_REVEAL =
  "opacity-0 transition-opacity duration-150 ease-out group-hover/stage:opacity-100 group-focus-within/stage:opacity-100 [@media(hover:none)]:opacity-100";

const CHIP = 34;

function CopyButton({
  media,
  getVideo,
}: {
  media: CopyableMedia;
  getVideo?: () => HTMLVideoElement | null;
}) {
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const icon =
    state === "copied" ? Check : state === "loading" ? LoaderCircle : Copy;

  return (
    <GlassButton
      width={CHIP}
      height={CHIP}
      radius={99}
      aria-label={
        state === "copied"
          ? "Copied"
          : state === "loading"
            ? "Copying"
            : "Copy image"
      }
      className="size-[34px]"
      onPointerEnter={() => prefetchCopy(media)}
      onClick={async (e) => {
        e.stopPropagation();
        if (state === "loading") return;
        setState("loading");
        const ok = await copySingleMedia(media, getVideo?.());
        if (!ok) {
          setState("idle");
          return;
        }
        setState("copied");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 1600);
      }}
    >
      <span className={cn(state === "loading" && "animate-spin")}>
        <MorphIcon
          icon={icon}
          size={16}
          strokeWidth={2}
          color="white"
          spring="smooth"
          reducedMotion="user"
        />
      </span>
    </GlassButton>
  );
}

function MuteButton({
  muted,
  onToggle,
}: {
  muted: boolean;
  onToggle: () => void;
}) {
  return (
    <GlassButton
      width={CHIP}
      height={CHIP}
      radius={99}
      aria-label={muted ? "Unmute" : "Mute"}
      aria-pressed={!muted}
      className="size-[34px]"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <MorphIcon
        icon={muted ? VolumeX : Volume2}
        size={16}
        strokeWidth={2}
        color="white"
        spring="smooth"
        reducedMotion="user"
      />
    </GlassButton>
  );
}

/** Track reads as a hairline until touched, then thickens under the pointer. */
function SeekSlider({
  current,
  duration,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  current: number;
  duration: number;
  onSeek: (t: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const seekable = Number.isFinite(duration) && duration > 0;
  const pct = seekable ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;

  const seekToClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !seekable) return;
    const rect = el.getBoundingClientRect();
    const fraction = Math.min(
      1,
      Math.max(0, (clientX - rect.left) / rect.width),
    );
    onSeek(fraction * duration);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!seekable) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onScrubStart?.();
    seekToClientX(e.clientX);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
    onScrubEnd?.();
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={seekable ? Math.round(duration) : 0}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`${Math.round(current)} of ${Math.round(duration) || 0} seconds`}
      className="group/seek relative h-[18px] w-full cursor-pointer touch-none select-none focus-visible:outline-none"
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        if (dragging) seekToClientX(e.clientX);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (!seekable) return;
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 10 : 2;
        onSeek(
          Math.min(
            duration,
            Math.max(0, current + (e.key === "ArrowLeft" ? -step : step)),
          ),
        );
      }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-px rounded-full bg-white/30 transition-[height] duration-150 ease-out",
          dragging ? "h-[4px]" : "h-[3px] group-hover/seek:h-[4px]",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "absolute bottom-px left-0 rounded-full bg-white transition-[height] duration-150 ease-out",
          dragging ? "h-[4px]" : "h-[3px] group-hover/seek:h-[4px]",
        )}
        style={{ width: `${pct}%` }}
      />
      {/* Thumb: the affordance that says "this is draggable". */}
      <span
        aria-hidden
        className={cn(
          "absolute bottom-0 size-[9px] -translate-x-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.45)]",
          "transition-[opacity,transform] duration-150 ease-out",
          dragging
            ? "scale-100 opacity-100"
            : "scale-50 opacity-0 group-hover/seek:scale-100 group-hover/seek:opacity-100 group-focus-visible/seek:scale-100 group-focus-visible/seek:opacity-100",
        )}
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

export function OverlayMediaActions({
  media,
  showMute,
  muted,
  onToggleMute,
  getVideo,
}: {
  media: CopyableMedia;
  showMute: boolean;
  muted: boolean;
  onToggleMute: () => void;
  getVideo?: () => HTMLVideoElement | null;
}) {
  useEffect(() => {
    prefetchCopy(media);
  }, [media.mediaId, media.kind]);

  return (
    <div
      className={cn(
        "absolute right-3 top-3 z-20 flex items-center gap-2",
        CHROME_REVEAL,
      )}
    >
      {showMute ? <MuteButton muted={muted} onToggle={onToggleMute} /> : null}
      <CopyButton media={media} getVideo={getVideo} />
    </div>
  );
}

const PILL = { w: 100, h: 74, r: 22 } as const;
/** A notch faster than `smooth` (k 170) — still no bounce. */
const ICON_SPRING = { stiffness: 280, damping: 32 } as const;

export function OverlayPlayPill({
  playing,
  visible,
  current,
  duration,
  onTogglePlay,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  playing: boolean;
  /** Controls are summoned by a tap on the media — never by hover. */
  visible: boolean;
  current: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.div
            className="pointer-events-auto"
            // Materialize: the surface scales and sharpens in rather than fading.
            initial={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.86, filter: "blur(8px)" }
            }
            animate={
              reduce
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, filter: "blur(0px)" }
            }
            exit={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.86, filter: "blur(8px)" }
            }
            transition={reduce ? { duration: 0.14 } : SURFACE_SPRING}
          >
            <div className="relative" style={{ width: PILL.w, height: PILL.h }}>
            <GlassSurface
              width={PILL.w}
              height={PILL.h}
              radius={PILL.r}
              style={{ width: PILL.w, height: PILL.h }}
            >
              <div className="relative size-full overflow-hidden">
                {/* Figma 206:312 — the glyph is centered in the whole pill. */}
                <button
                  type="button"
                  aria-label={playing ? "Pause" : "Play"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePlay();
                  }}
                  className="absolute inset-0 grid place-items-center text-white outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
                  style={{ borderRadius: PILL.r }}
                >
                  {/* Play's mass sits left of its box — pull it 2px left so
                      the triangle reads centered, without changing the pill. */}
                  <span
                    className="flex w-7 justify-center"
                    style={!playing ? { transform: "translateX(-2px)" } : undefined}
                  >
                    <MorphIcon
                      icon={playing ? Pause : Play}
                      size={28}
                      strokeWidth={0}
                      fill="white"
                      color="white"
                      spring={ICON_SPRING}
                      reducedMotion="user"
                    />
                  </span>
                </button>
                <div className="absolute inset-x-0 -bottom-px">
                  <SeekSlider
                    current={current}
                    duration={duration}
                    onSeek={onSeek}
                    onScrubStart={onScrubStart}
                    onScrubEnd={onScrubEnd}
                  />
                </div>
              </div>
            </GlassSurface>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

