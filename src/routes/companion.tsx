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
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function Companion() {
  const {
    readAloud,
    startListening,
    robotState,
    level,
    stage,
    statusText,
  } = useVoiceSession();
  const recognitionRef = useRef<Recognition | null>(null);
  const stageRef = useRef(stage);
  const activatingRef = useRef(false);
  const [wakeAvailable, setWakeAvailable] = useState(true);
  const [wakeActive, setWakeActive] = useState(false);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  const activate = useCallback(async () => {
    if (activatingRef.current || !["idle", "answered", "error"].includes(stageRef.current)) return;
    activatingRef.current = true;
    recognitionRef.current?.stop();
    setWakeActive(false);
    try {
      await readAloud("How can I help you today?");
      await startListening();
    } finally {
      activatingRef.current = false;
    }
  }, [readAloud, startListening]);

  useEffect(() => {
    const settings = storage.getSettings();
    if (!settings.wakeWordEnabled) {
      setWakeActive(false);
      return;
    }

    const speechWindow = window as typeof window & {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Ctor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Ctor) {
      setWakeAvailable(false);
      return;
    }

    setWakeAvailable(true);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GH";
    recognition.onresult = (event) => {
      const latest = event.results[event.results.length - 1]?.[0]?.transcript?.toLowerCase() ?? "";
      if (latest.includes("hey dami") || latest.includes("hey dummy") || latest.includes("hey demi")) {
        void activate();
      }
    };
    recognition.onerror = () => setWakeActive(false);
    recognition.onend = () => {
      setWakeActive(false);
      if (!["idle", "answered", "error"].includes(stageRef.current) || !storage.getSettings().wakeWordEnabled) return;
      window.setTimeout(() => {
        if (recognitionRef.current !== recognition) return;
        try {
          recognition.start();
          setWakeActive(true);
        } catch {
          setWakeActive(false);
        }
      }, 700);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setWakeActive(true);
    } catch {
      setWakeActive(false);
    }

    return () => {
      recognition.onend = null;
      recognition.abort();
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };
  }, [activate]);

  return (
    <main className="flex min-h-screen select-none flex-col items-center justify-end bg-transparent p-2 text-center">
      <button
        type="button"
        onClick={() => void activate()}
        className="rounded-full bg-transparent p-0 outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Talk with Dami"
      >
        <DamiAvatar state={robotState} level={level} size={205} />
      </button>
      <div className="-mt-2 rounded-full border border-border/70 bg-background/90 px-4 py-2 shadow-lg backdrop-blur">
        <p className="text-sm font-semibold">Dami</p>
        <p className="max-w-[230px] truncate text-[11px] text-muted-foreground">
          {stage === "idle" && wakeAvailable
            ? wakeActive ? 'Say "Hey Dami"' : "Click Dami to talk"
            : statusText}
        </p>
      </div>
    </main>
  );
}
