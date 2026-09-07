import { useEffect, useRef } from "react";

import robot from "@/assets/dami-robot.png";
import "@/dami-avatar.css";
import { cn } from "@/lib/utils";
import type { DamiState } from "@/lib/types";

const STATE_CLASS: Record<DamiState, string> = {
  idle: "dami-state-idle",
  welcome: "dami-state-welcome",
  listening: "dami-state-listening",
  thinking: "dami-state-thinking",
  speaking: "dami-state-speaking",
  success: "dami-state-success",
  error: "dami-state-error",
};

interface DamiAvatarProps {
  state?: DamiState;
  size?: number;
  className?: string;
  /** 0–1 microphone level, used to scale the listening halo. */
  level?: number;
}

export function DamiAvatar({ state = "idle", size = 220, className, level = 0 }: DamiAvatarProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const halo = state === "listening" ? 1 + Math.min(level, 1) * 0.25 : 1;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const render = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;

      root.style.setProperty("--dami-look-x", `${currentX * 9}px`);
      root.style.setProperty("--dami-look-y", `${currentY * 6}px`);
      root.style.setProperty("--dami-tilt-y", `${currentX * 7}deg`);
      root.style.setProperty("--dami-tilt-x", `${currentY * -5}deg`);
      root.style.setProperty("--dami-shift-x", `${currentX * 5}px`);
      root.style.setProperty("--dami-shift-y", `${currentY * 3}px`);

      frame = window.requestAnimationFrame(render);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const rangeX = Math.max(window.innerWidth * 0.42, bounds.width);
      const rangeY = Math.max(window.innerHeight * 0.42, bounds.height);

      targetX = Math.max(-1, Math.min(1, (event.clientX - centerX) / rangeX));
      targetY = Math.max(-1, Math.min(1, (event.clientY - centerY) / rangeY));
    };

    const reset = () => {
      targetX = 0;
      targetY = 0;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("blur", reset);
    document.documentElement.addEventListener("mouseleave", reset);
    frame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", reset);
      document.documentElement.removeEventListener("mouseleave", reset);
    };
  }, []);

  const reactToPointer = () => {
    const root = rootRef.current;
    if (!root) return;
    root.dataset.engaged = "true";
    window.setTimeout(() => {
      if (rootRef.current) delete rootRef.current.dataset.engaged;
    }, 520);
  };

  return (
    <div
      ref={rootRef}
      className={cn("dami-avatar relative grid place-items-center", className)}
      style={{ width: size, height: size }}
      data-dami-state={state}
      aria-live="polite"
      onPointerDown={reactToPointer}
    >
      <span
        aria-hidden
        className="dami-halo absolute inset-0 rounded-full bg-primary/10"
        style={{ transform: `scale(${halo})` }}
      />

      <div className="dami-look-layer relative z-10 h-full w-full">
        <img
          src={robot}
          alt={`Dami, the African legal AI agent — ${state}`}
          width={size}
          height={size}
          className={cn("h-full w-full object-contain", STATE_CLASS[state])}
          draggable={false}
        />

        <span aria-hidden className="dami-eye dami-eye-left" />
        <span aria-hidden className="dami-eye dami-eye-right" />
      </div>
    </div>
  );
}
