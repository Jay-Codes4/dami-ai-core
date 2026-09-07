import { useEffect, useRef } from "react";

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
      currentX += (targetX - currentX) * 0.11;
      currentY += (targetY - currentY) * 0.11;

      // The head does most of the tracking. The torso only reacts subtly.
      root.style.setProperty("--dami-head-x", `${currentX * 11}px`);
      root.style.setProperty("--dami-head-y", `${currentY * 7}px`);
      root.style.setProperty("--dami-head-turn", `${currentX * 13}deg`);
      root.style.setProperty("--dami-head-nod", `${currentY * -8}deg`);
      root.style.setProperty("--dami-body-turn", `${currentX * 2.2}deg`);
      root.style.setProperty("--dami-arm-react", `${currentX * 5}deg`);

      frame = window.requestAnimationFrame(render);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const rangeX = Math.max(window.innerWidth * 0.38, bounds.width);
      const rangeY = Math.max(window.innerHeight * 0.38, bounds.height);

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
    }, 850);
  };

  const part = (name: string, className: string) => (
    <img src={robot} alt="" aria-hidden className={cn("dami-part", className)} draggable={false} />
  );

  return (
    <div
      ref={rootRef}
      className={cn("dami-avatar relative grid place-items-center", className)}
      style={{ width: size, height: size }}
      data-dami-state={state}
      aria-label={`Dami, the African legal AI agent — ${state}`}
      aria-live="polite"
      onPointerDown={reactToPointer}
    >
      <span
        aria-hidden
        className="dami-halo absolute inset-0 rounded-full bg-primary/10"
        style={{ transform: `scale(${halo})` }}
      />

      <div className="dami-rig relative z-10 h-full w-full" role="img" aria-label={`Dami is ${state}`}>
        {part("body", "dami-body")}
        {part("left arm", "dami-arm dami-arm-left")}
        {part("right arm", "dami-arm dami-arm-right")}
        {part("head", "dami-head")}
      </div>
    </div>
  );
}
