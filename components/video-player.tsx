"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "video" | "gif";

export function VideoPlayer({
  src,
  poster,
  mode = "video",
  className,
}: {
  src: string;
  poster?: string | null;
  mode?: Mode;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(mode === "gif");
  const [showControls, setShowControls] = useState(mode !== "gif");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [errored, setErrored] = useState(false);

  const isGif = mode === "gif";

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  function toggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function seek(clientX: number, rect: DOMRect) {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    v.currentTime = fraction * v.duration;
  }

  function toggleFullscreen(e: React.MouseEvent) {
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) void el.requestFullscreen();
    else void document.exitFullscreen();
  }

  const bump = useCallback(() => {
    if (isGif) return;
    setShowControls(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 2200);
  }, [isGif]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!containerRef.current?.contains(document.activeElement)) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn(
        "group relative overflow-hidden rounded-2xl bg-black outline-none",
        className,
      )}
      onMouseMove={bump}
      onMouseEnter={bump}
      onMouseLeave={() => {
        if (!isGif && playing) setShowControls(false);
      }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        loop={isGif}
        autoPlay={isGif}
        muted={isGif}
        playsInline
        preload="metadata"
        onClick={isGif ? undefined : togglePlay}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setErrored(true)}
        className="block h-auto w-full"
      />

      {errored ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">
          Failed to load video
        </div>
      ) : null}

      {!isGif && !playing && !errored ? (
        <button
          type="button"
          aria-label="Play"
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="grid size-16 place-items-center rounded-full bg-black/60 shadow-lg backdrop-blur-md transition-transform duration-200 group-hover:scale-105">
            <Play className="ml-1 size-7 fill-white text-white" />
          </span>
        </button>
      ) : null}

      {!isGif ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pb-3 pt-6 transition-opacity duration-200",
            showControls || !playing ? "opacity-100" : "opacity-0",
          )}
        >
          <div
            className="pointer-events-auto group/bar relative h-1 cursor-pointer rounded-full bg-white/25 transition-[height] hover:h-1.5"
            onClick={(e) => seek(e.clientX, e.currentTarget.getBoundingClientRect())}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="pointer-events-auto flex items-center gap-3 text-xs text-white">
            <button
              onClick={togglePlay}
              className="grid place-items-center rounded-full p-1 hover:bg-white/10"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="size-4 fill-white" />
              ) : (
                <Play className="ml-0.5 size-4 fill-white" />
              )}
            </button>
            <span className="tabular-nums">
              {formatTime(current)} <span className="text-white/50">/ {formatTime(duration)}</span>
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={toggleMute}
                className="grid place-items-center rounded-full p-1 hover:bg-white/10"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
              <button
                onClick={toggleFullscreen}
                className="grid place-items-center rounded-full p-1 hover:bg-white/10"
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize className="size-4" />
                ) : (
                  <Maximize className="size-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
