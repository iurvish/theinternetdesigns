"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Copy, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassButton, GlassSurface } from "./glass";
import { copySingleMedia, type CopyableMedia } from "./copy-media";

/** Critically damped: state swaps should settle, never bounce. */
const ICON_SPRING = { type: "spring", duration: 0.28, bounce: 0 } as const;

const CHROME_REVEAL =
  "opacity-0 transition-opacity duration-150 ease-out group-hover/stage:opacity-100 group-focus-within/stage:opacity-100 [@media(hover:none)]:opacity-100";

/**
 * Both icons stay mounted and cross-fade in place, so an interrupted toggle
 * reverses from wherever it is instead of waiting for an exit to finish.
 */
function SwapIcon({
  active,
  Active,
  Idle,
  size,
}: {
  active: boolean;
  Active: ComponentType<{ className?: string; strokeWidth?: number }>;
  Idle: ComponentType<{ className?: string; strokeWidth?: number }>;
  size: number;
}) {
  const reduce = useReducedMotion();

  return (
    <span
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      {(
        [
          [true, Active],
          [false, Idle],
        ] as const
      ).map(([state, Icon]) => (
        <motion.span
          key={String(state)}
          className="col-start-1 row-start-1 flex"
          style={{ width: size, height: size, pointerEvents: "none" }}
          initial={false}
          animate={
            reduce
              ? { opacity: state === active ? 1 : 0 }
              : {
                  opacity: state === active ? 1 : 0,
                  scale: state === active ? 1 : 0.6,
                  filter: state === active ? "blur(0px)" : "blur(3px)",
                }
          }
          transition={reduce ? { duration: 0.12 } : ICON_SPRING}
        >
          <Icon className="size-full" strokeWidth={2} />
        </motion.span>
      ))}
    </span>
  );
}

function CopyButton({
  media,
  getVideo,
}: {
  media: CopyableMedia;
  getVideo?: () => HTMLVideoElement | null;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <GlassButton
      width={34}
      height={34}
      radius={99}
      aria-label={copied ? "Copied" : "Copy image"}
      className="size-[34px]"
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copySingleMedia(media, getVideo?.());
        if (!ok) return;
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      }}
    >
      <SwapIcon active={copied} Active={Check} Idle={Copy} size={16} />
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
      width={34}
      height={34}
      radius={99}
      aria-label={muted ? "Unmute" : "Mute"}
      aria-pressed={!muted}
      className="size-[34px]"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <SwapIcon
        active={muted}
        Active={VolumeX}
        Idle={Volume2}
        size={16}
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
      className="group/seek relative h-4 w-full cursor-pointer touch-none select-none focus-visible:outline-none"
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
          "absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-white/30 transition-[height] duration-150 ease-out",
          dragging ? "h-[5px]" : "h-[3px] group-hover/seek:h-[5px]",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white transition-[height] duration-150 ease-out",
          dragging ? "h-[5px]" : "h-[3px] group-hover/seek:h-[5px]",
        )}
        style={{ width: `${pct}%` }}
      />
      {/* Thumb: the affordance that says "this is draggable". */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.45)]",
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

const PILL = { w: 112, h: 74, r: 30 } as const;

export function OverlayPlayPill({
  playing,
  current,
  duration,
  onTogglePlay,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  playing: boolean;
  current: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      <div
        className={cn(
          "pointer-events-auto transition-[opacity,transform,filter] duration-200 ease-out",
          "motion-reduce:transition-opacity",
          // Paused, the pill is the subject. Playing, it steps back until asked for.
          playing
            ? "scale-[0.94] opacity-0 blur-[4px] group-hover/stage:scale-100 group-hover/stage:opacity-100 group-hover/stage:blur-none group-focus-within/stage:scale-100 group-focus-within/stage:opacity-100 group-focus-within/stage:blur-none [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:blur-none"
            : "scale-100 opacity-100 blur-none",
        )}
      >
        <GlassSurface
          width={PILL.w}
          height={PILL.h}
          radius={PILL.r}
          style={{ width: PILL.w, height: PILL.h }}
        >
          <div className="relative size-full">
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePlay();
              }}
              className="absolute inset-x-0 top-0 bottom-[18px] grid place-items-center text-white outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
              style={{ borderRadius: PILL.r }}
            >
              <SwapIcon
                active={playing}
                Active={PauseGlyph}
                Idle={PlayGlyph}
                size={28}
              />
            </button>
            <div className="absolute inset-x-3.5 bottom-[9px]">
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
    </div>
  );
}

/** A triangle's visual mass sits left of its box, so it needs an optical nudge. */
function PlayGlyph({ className }: { className?: string }) {
  return (
    <Play
      className={cn("size-full translate-x-[7%] fill-white", className)}
      strokeWidth={0}
    />
  );
}

function PauseGlyph({ className }: { className?: string }) {
  return (
    <Pause className={cn("size-full fill-white", className)} strokeWidth={0} />
  );
}
