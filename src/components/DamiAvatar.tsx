import type { CSSProperties } from "react";
import "@/dami-avatar.css";
import { cn } from "@/lib/utils";
import type { DamiState } from "@/lib/types";

interface DamiAvatarProps {
  state?: DamiState;
  size?: number;
  className?: string;
  /** 0–1 microphone level, used to scale the listening halo. */
  level?: number;
}

export function DamiAvatar({ state = "idle", size = 220, className, level = 0 }: DamiAvatarProps) {
  const halo = state === "listening" ? 1 + Math.min(level, 1) * 0.25 : 1;
  const style = {
    width: size,
    height: size,
    "--dami-level": Math.min(Math.max(level, 0), 1),
  } as CSSProperties;

  return (
    <div
      className={cn("dami-avatar relative grid place-items-center", className)}
      style={style}
      data-dami-state={state}
      aria-live="polite"
    >
      <span
        aria-hidden
        className="dami-halo absolute inset-0 rounded-full bg-primary/10"
        style={{ transform: `scale(${halo})` }}
      />

      <video
        src="/dami-alive.mp4.mp4"
        aria-label={`Dami, the African legal AI agent — ${state}`}
        width={size}
        height={size}
        className="dami-video relative z-10 h-full w-full object-contain"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
      />
    </div>
  );
}
