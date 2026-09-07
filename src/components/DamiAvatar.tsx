import robot from "@/assets/dami-robot.png";
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
  const halo = state === "listening" ? 1 + Math.min(level, 1) * 0.25 : 1;

  return (
    <div
      className={cn("relative grid place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        className="dami-halo absolute inset-0 rounded-full bg-primary/10"
        style={{ transform: `scale(${halo})` }}
      />
      <img
        src={robot}
        alt="Dami, the voice-first Ghanaian legal research assistant"
        width={size}
        height={size}
        className={cn("relative z-10 h-full w-full object-contain", STATE_CLASS[state])}
      />
    </div>
  );
}
