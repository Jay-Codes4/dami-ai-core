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
  const voice = useVoiceSession();
  const recognitionRef = useRef<Recognition | null>(null);
  const [wakeAvailable, setWakeAvailable] = useState(true);
  const [wakeActive, setWakeActive] = useState(false);

  const activate = useCallback(async () => {
    recognitionRef.current?.stop();
    setWakeActive(false);
    await voice.readAloud("How can I help you today?");
    await voice.startListening();
  }, [voice]);

  useEffect(() => {
    const settings = storage.getSettings();
    if (!settings.wakeWordEnabled) return;

    const speechWindow = window as typeof window & {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const Ctor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Ctor) {
      setWakeAvailable(false);
      return;
    }

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
      if (["idle", "answered", "error"].includes(voice.stage) && storage.getSettings().wakeWordEnabled) {
        window.setTimeout(() => {
          try { recognition.start(); setWakeActive(true); } catch { /* recognition may already be starting */ }
        }, 600);
      }
    };

    recognitionRef.current = recognition;
    try { recognition.start(); setWakeActive(true); } catch { setWakeActive(false); }

    return () => {
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [activate, voice.stage]);

  return (
    <main className="flex min-h-screen select-none flex-col items-center justify-end bg-transparent p-2 text-center">
      <button
        type="button"
        onClick={() => void activate()}
        className="rounded-full bg-transparent p-0 outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Talk with Dami"
      >
        <DamiAvatar state={voice.robotState} level={voice.level} size={205} />
      </button>
      <div className="-mt-2 rounded-full border border-border/70 bg-background/90 px-4 py-2 shadow-lg backdrop-blur">
        <p className="text-sm font-semibold">Dami</p>
        <p className="max-w-[230px] truncate text-[11px] text-muted-foreground">
          {voice.stage === "idle" && wakeAvailable
            ? wakeActive ? 'Say “Hey Dami”' : "Click Dami to talk"
            : voice.statusText}
        </p>
      </div>
    </main>
  );
}
