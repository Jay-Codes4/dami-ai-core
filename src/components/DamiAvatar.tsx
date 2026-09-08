import { useEffect, useState, type CSSProperties } from "react";
import robot from "@/assets/dami-robot.png";
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

type MotionBeat = "rest" | "tilt-left" | "tilt-right" | "lift" | "hello";

const IDLE_BEATS: MotionBeat[] = ["rest", "tilt-left", "rest", "tilt-right", "lift", "rest"];

export function DamiAvatar({ state = "idle", size = 220, className, level = 0 }: DamiAvatarProps) {
  const halo = state === "listening" ? 1 + Math.min(level, 1) * 0.25 : 1;
  const [motionBeat, setMotionBeat] = useState<MotionBeat>(state === "welcome" ? "hello" : "rest");

  useEffect(() => {
    if (state === "welcome") {
      setMotionBeat("hello");
      return;
    }
    if (state !== "idle") {
      setMotionBeat("rest");
      return;
    }

    let index = 0;
    setMotionBeat(IDLE_BEATS[index]);
    const timer = window.setInterval(() => {
      index = (index + 1) % IDLE_BEATS.length;
      setMotionBeat(IDLE_BEATS[index]);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [state]);

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
      data-dami-beat={motionBeat}
      aria-live="polite"
    >
      <span
        aria-hidden
        className="dami-halo absolute inset-0 rounded-full bg-primary/10"
        style={{ transform: `scale(${halo})` }}
      />

      <img
        src={robot}
        alt={`Dami, the African legal AI agent — ${state}`}
        width={size}
        height={size}
        className="dami-character relative z-10 h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
