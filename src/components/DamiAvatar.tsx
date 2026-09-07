import { useEffect, useRef, useState } from "react";

import robot from "@/assets/dami-robot.png";
import type { DamiState } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  /** Makes the robot itself an accessible interaction target. */
  onActivate?: () => void;
  activationLabel?: string;
}

export function DamiAvatar({
  state = "idle",
  size = 220,
  className,
  level = 0,
  onActivate,
  activationLabel = "Talk with Dami",
}: DamiAvatarProps) {
  const halo = state === "listening" ? 1 + Math.min(level, 1) * 0.25 : 1;
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [engaged, setEngaged] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const activate = () => {
    setEngaged(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setEngaged(false), 650);
    onActivate?.();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: Math.max(-1, Math.min(1, py * -2)), y: Math.max(-1, Math.min(1, px * 2)) });
  };

  const resetTilt = () => setTilt({ x: 0, y: 0 });

  const visual = (
    <div
      className={cn("dami-interactive relative grid place-items-center", engaged && "dami-engaged")}
      style={{
        width: size,
        height: size,
        transform: `perspective(800px) rotateX(${tilt.x * 3.5}deg) rotateY(${tilt.y * 5}deg)`,
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      aria-hidden={onActivate ? undefined : true}
    >
      <span
        aria-hidden
        className="dami-halo absolute inset-0 rounded-full bg-primary/10"
        style={{ transform: `scale(${halo})` }}
      />
      <span aria-hidden className="dami-presence-ring absolute inset-[8%] rounded-full border border-primary/15" />
      <img
        src={robot}
        alt={onActivate ? "Dami, the voice-first Ghanaian legal research assistant" : ""}
        width={size}
        height={size}
        draggable={false}
        className={cn("relative z-10 h-full w-full select-none object-contain", STATE_CLASS[state])}
      />
      <span aria-hidden className="dami-attention-dot absolute right-[13%] top-[17%] z-20 h-2.5 w-2.5 rounded-full bg-primary/70" />
    </div>
  );

  if (!onActivate) {
    return <div className={cn("inline-grid place-items-center", className)}>{visual}</div>;
  }

  return (
    <button
      type="button"
      className={cn(
        "group inline-grid place-items-center rounded-full bg-transparent p-0 transition-transform hover:scale-[1.015] active:scale-[0.985]",
        className,
      )}
      onClick={activate}
      aria-label={activationLabel}
      title={activationLabel}
    >
      {visual}
    </button>
  );
}
