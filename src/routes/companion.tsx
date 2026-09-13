import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { DamiAvatar } from "@/components/DamiAvatar";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { storage } from "@/lib/storage";
import { playListeningEndCue } from "@/services/voice/listeningCue";

export const Route = createFileRoute("/companion")({
  validateSearch: (search: Record<string, unknown>) => ({
    desktop: search.desktop === "1" || search.desktop === 1 ? 1 : undefined,
  }),
  component: Companion,
});
type RecognitionEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;
type WakeStatus =
  "starting" | "ready" | "error" | "unsupported" | "disabled" | "stopped" | "listening-local";
type WakePayload = {
  activationId?: string;
  source?: "wake-word" | "tray";
  command?: string;
  audioBase64?: string;
};
type DesktopBridge = {
  isDesktop?: boolean;
  onWakeWord?: (cb: (payload: WakePayload) => void) => void | (() => void);
  onTalkRequest?: (cb: (payload: WakePayload) => void) => void | (() => void);
  getWakeStatus?: () => Promise<WakeStatus>;
  onWakeStatus?: (cb: (s: WakeStatus) => void) => void | (() => void);
  localTranscribe?: () => Promise<string>;
  localSpeak?: (text: string) => Promise<boolean>;
  stopLocalSpeech?: () => Promise<boolean>;
  rendererReady?: () => Promise<boolean>;
  beginVoiceTurn?: (activationId?: string) => Promise<boolean>;
  endVoiceTurn?: () => Promise<boolean>;
  reportVoiceStage?: (stage: string, error?: string) => Promise<boolean>;
};

function desktopAction(stage: ReturnType<typeof useVoiceSession>["stage"], wake: WakeStatus) {
  if (stage === "requesting-permission" || stage === "listening") return "Dami is listening…";
  if (stage === "transcribing") return "Dami is transcribing…";
  if (stage === "researching") return "Dami is researching…";
  if (stage === "speaking") return "Dami is speaking…";
  if (stage === "answered") return "Done · click me again";
  if (stage === "error") return "Try again · click me";
  if (stage === "welcome" || wake === "starting") return "Dami is getting ready…";
  if (wake === "ready") return "Click me · or say “Hey Dami”";
  if (wake === "disabled") return "Click me · wake phrase is off";
  return "Click me to talk";
}
function Companion() {
  const { desktop } = Route.useSearch();
  const {
    startListening,
    stopSpeaking,
    askWakeCapture,
    ask,
    robotState,
    level,
    stage,
    statusText,
  } = useVoiceSession();
  const recognitionRef = useRef<Recognition | null>(null),
    stageRef = useRef(stage),
    activatingRef = useRef(false),
    desktopTurnRef = useRef(false);
  const [wakeAvailable, setWakeAvailable] = useState(true),
    [wakeActive, setWakeActive] = useState(false),
    [nativeWakeStatus, setNativeWakeStatus] = useState<WakeStatus>("starting");
  useEffect(() => {
    stageRef.current = stage;
    const bridge = (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
    void bridge?.reportVoiceStage?.(stage, statusText);
  }, [stage, statusText]);
  useEffect(() => {
    const bridge = (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
    if (!bridge?.isDesktop) return;
    const html = document.documentElement,
      body = document.body;
    const previous = {
      htmlBackground: html.style.background,
      htmlBackgroundColor: html.style.backgroundColor,
      bodyBackground: body.style.background,
      bodyBackgroundColor: body.style.backgroundColor,
      bodyMargin: body.style.margin,
    };
    html.style.setProperty("background", "transparent", "important");
    html.style.setProperty("background-color", "transparent", "important");
    body.style.setProperty("background", "transparent", "important");
    body.style.setProperty("background-color", "transparent", "important");
    body.style.margin = "0";
    return () => {
      html.style.background = previous.htmlBackground;
      html.style.backgroundColor = previous.htmlBackgroundColor;
      body.style.background = previous.bodyBackground;
      body.style.backgroundColor = previous.bodyBackgroundColor;
      body.style.margin = previous.bodyMargin;
    };
  }, []);
  const activate = useCallback(
    async (wake?: WakePayload) => {
      if (activatingRef.current) return;
      if (stageRef.current === "speaking") stopSpeaking();
      else if (!["welcome", "idle", "answered", "error"].includes(stageRef.current)) return;
      activatingRef.current = true;
      recognitionRef.current?.stop();
      const bridge = (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
      try {
        if (bridge?.isDesktop) {
          desktopTurnRef.current = true;
          await bridge.beginVoiceTurn?.(wake?.activationId);
        }
        const command = wake?.command?.trim() || "";
        if (command) {
          void playListeningEndCue();
          if (wake?.audioBase64) await askWakeCapture(wake.audioBase64, command);
          else await ask(command);
          return;
        }
        // Open the microphone immediately. The rising cue and visible listening
        // state acknowledge a wake phrase without delaying capture or recording
        // Dami's own spoken greeting as part of the user's question.
        await startListening();
      } finally {
        activatingRef.current = false;
      }
    },
    [ask, askWakeCapture, startListening, stopSpeaking],
  );
  useEffect(() => {
    if (!desktopTurnRef.current || !["idle", "answered", "error"].includes(stage)) return;
    desktopTurnRef.current = false;
    const bridge = (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
    void bridge?.endVoiceTurn?.();
  }, [stage]);
  useEffect(() => {
    const bridge = (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
    if (!bridge?.isDesktop) return;
    let wc: void | (() => void),
      tc: void | (() => void),
      sc: void | (() => void),
      cancelled = false;
    setWakeAvailable(true);
    if (bridge.onWakeWord) wc = bridge.onWakeWord((payload) => void activate(payload));
    if (bridge.onTalkRequest) tc = bridge.onTalkRequest((payload) => void activate(payload));
    if (bridge.onWakeStatus)
      sc = bridge.onWakeStatus((s) => {
        setNativeWakeStatus(s);
        setWakeActive(s === "ready");
        setWakeAvailable(!["error", "unsupported", "stopped"].includes(s));
      });
    if (bridge.getWakeStatus)
      void bridge
        .getWakeStatus()
        .then((s) => {
          if (cancelled) return;
          setNativeWakeStatus(s);
          setWakeActive(s === "ready");
          setWakeAvailable(!["error", "unsupported", "stopped"].includes(s));
        })
        .catch(() => {
          if (!cancelled) {
            setNativeWakeStatus("error");
            setWakeActive(false);
            setWakeAvailable(false);
          }
        });
    // Register listeners before announcing readiness. Electron can then replay
    // a wake or tray activation that arrived while React was loading.
    void bridge.rendererReady?.();
    return () => {
      cancelled = true;
      if (typeof wc === "function") wc();
      if (typeof tc === "function") tc();
      if (typeof sc === "function") sc();
    };
  }, [activate]);
  useEffect(() => {
    const bridge = (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
    if (bridge?.isDesktop) return;
    const settings = storage.getSettings();
    if (!settings.wakeWordEnabled) {
      setWakeActive(false);
      return;
    }
    const sw = window as typeof window & {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Ctor = sw.SpeechRecognition ?? sw.webkitSpeechRecognition;
    if (!Ctor) {
      setWakeAvailable(false);
      return;
    }
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e) => {
      const latest = e.results[e.results.length - 1]?.[0]?.transcript?.toLowerCase() ?? "";
      if (/hey (dami|dummy|demi)/.test(latest)) void activate();
    };
    r.onerror = () => setWakeActive(false);
    r.onend = () => {
      setWakeActive(false);
      if (
        !["idle", "answered", "error"].includes(stageRef.current) ||
        !storage.getSettings().wakeWordEnabled
      )
        return;
      window.setTimeout(() => {
        if (recognitionRef.current !== r) return;
        try {
          r.start();
          setWakeActive(true);
        } catch {
          setWakeActive(false);
        }
      }, 700);
    };
    recognitionRef.current = r;
    try {
      r.start();
      setWakeActive(true);
    } catch {
      setWakeActive(false);
    }
    return () => {
      r.onend = null;
      r.abort();
      if (recognitionRef.current === r) recognitionRef.current = null;
    };
  }, [activate]);
  const bridge =
    typeof window === "undefined"
      ? undefined
      : (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
  const isDesktop = desktop === 1 || Boolean(bridge?.isDesktop);
  const desktopIdleText =
    nativeWakeStatus === "starting"
      ? "Starting Hey Dami…"
      : nativeWakeStatus === "listening-local"
        ? "I'm listening — ask your question"
        : nativeWakeStatus === "ready"
          ? 'Say "Hey Dami" or tap me'
          : nativeWakeStatus === "disabled"
            ? "Wake word is off — tap Dami"
            : "Hey Dami unavailable — tap Dami";
  const idleText = isDesktop
    ? desktopIdleText
    : wakeAvailable
      ? wakeActive
        ? 'Say "Hey Dami"'
        : "Wake listener unavailable — tap Dami"
      : "Tap Dami to talk";
  const desktopStatus = desktopAction(stage, nativeWakeStatus);
  const desktopIsActive = [
    "requesting-permission",
    "listening",
    "transcribing",
    "researching",
    "speaking",
  ].includes(stage);
  if (isDesktop)
    return (
      <main className="flex h-screen w-screen select-none items-center justify-center overflow-hidden bg-transparent p-0">
        <button
          type="button"
          onPointerDown={() => void activate()}
          className="flex h-full w-full flex-col items-center justify-center gap-1 bg-transparent p-0 outline-none transition-transform hover:scale-[1.015] focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`${desktopStatus}. Activate Dami.`}
        >
          <DamiAvatar
            state={robotState}
            level={level}
            size={184}
            className="shrink-0 overflow-hidden rounded-full"
          />
          <span
            className={`inline-flex max-w-[226px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-center text-[11px] font-semibold leading-tight shadow-lg backdrop-blur-md ${
              desktopIsActive
                ? "border-primary/70 bg-primary text-primary-foreground"
                : "border-white/25 bg-slate-950/85 text-white"
            }`}
            aria-live="polite"
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                desktopIsActive ? "animate-pulse bg-white" : "bg-sky-400"
              }`}
            />
            {desktopStatus}
          </span>
        </button>
      </main>
    );
  return (
    <main className="flex min-h-screen select-none flex-col items-center justify-end bg-transparent p-2 text-center">
      <button
        type="button"
        onPointerDown={() => void activate()}
        className="rounded-full bg-transparent p-0 outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Talk with Dami"
      >
        <DamiAvatar state={robotState} level={level} size={205} />
      </button>
      <div className="-mt-2 rounded-full border border-border/70 bg-background/90 px-4 py-2 shadow-lg backdrop-blur">
        <p className="text-sm font-semibold">Dami</p>
        <p className="max-w-[250px] text-balance text-[11px] leading-4 text-muted-foreground">
          {stage === "idle" ? idleText : statusText}
        </p>
      </div>
    </main>
  );
}
