import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { DamiAvatar } from "@/components/DamiAvatar";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { storage } from "@/lib/storage";

export const Route = createFileRoute("/companion")({ component: Companion });
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
type DesktopBridge = {
  isDesktop?: boolean;
  onWakeWord?: (cb: () => void) => void | (() => void);
  onTalkRequest?: (cb: () => void) => void | (() => void);
  getWakeStatus?: () => Promise<WakeStatus>;
  onWakeStatus?: (cb: (s: WakeStatus) => void) => void | (() => void);
  localTranscribe?: () => Promise<string>;
  localSpeak?: (text: string) => Promise<boolean>;
  stopLocalSpeech?: () => Promise<boolean>;
  beginVoiceTurn?: () => Promise<boolean>;
  endVoiceTurn?: () => Promise<boolean>;
  reportVoiceStage?: (stage: string, error?: string) => Promise<boolean>;
};
function Companion() {
  const { startListening, stopSpeaking, robotState, level, stage, statusText } = useVoiceSession();
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
  const activate = useCallback(async () => {
    if (activatingRef.current) return;
    if (stageRef.current === "speaking") stopSpeaking();
    else if (!["idle", "answered", "error"].includes(stageRef.current)) return;
    activatingRef.current = true;
    recognitionRef.current?.stop();
    const bridge = (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
    try {
      if (bridge?.isDesktop) {
        desktopTurnRef.current = true;
        await bridge.beginVoiceTurn?.();
      }
      // Open the microphone immediately. A spoken greeting delayed capture and
      // could be transcribed as the user's question on slower machines.
      await startListening();
    } finally {
      activatingRef.current = false;
    }
  }, [startListening, stopSpeaking]);
  useEffect(() => {
    if (!desktopTurnRef.current || !["answered", "error"].includes(stage)) return;
    desktopTurnRef.current = false;
    const bridge = (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
    void bridge?.endVoiceTurn?.();
  }, [stage]);
  useEffect(() => {
    const bridge = (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
    if (!bridge?.isDesktop) return;
    if (!storage.getSettings().wakeWordEnabled) {
      setWakeAvailable(false);
      setWakeActive(false);
      setNativeWakeStatus("disabled");
      return;
    }
    let wc: void | (() => void),
      tc: void | (() => void),
      sc: void | (() => void),
      cancelled = false;
    setWakeAvailable(true);
    if (bridge.onWakeWord) wc = bridge.onWakeWord(() => void activate());
    if (bridge.onTalkRequest) tc = bridge.onTalkRequest(() => void activate());
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
  const bridge = (window as typeof window & { damiDesktop?: DesktopBridge }).damiDesktop;
  const isDesktop = Boolean(bridge?.isDesktop);
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
  if (isDesktop)
    return (
      <main className="flex h-screen w-screen select-none items-center justify-center overflow-hidden bg-transparent p-0">
        <button
          type="button"
          onPointerDown={() => void activate()}
          className="grid h-[180px] w-[180px] place-items-center overflow-hidden rounded-full bg-transparent p-0 outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Talk with Dami"
        >
          <DamiAvatar
            state={robotState}
            level={level}
            size={180}
            className="overflow-hidden rounded-full"
          />
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
        <p className="max-w-[230px] truncate text-[11px] text-muted-foreground">
          {stage === "idle" ? idleText : statusText}
        </p>
      </div>
    </main>
  );
}
