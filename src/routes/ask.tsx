import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Mic, Send, Square, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { AnswerPanel } from "@/components/AnswerPanel";
import { AppShell } from "@/components/AppShell";
import { DamiAvatar } from "@/components/DamiAvatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { DAMI_LANGUAGES, getDamiLanguage, type DamiLanguageCode } from "@/lib/languages";
import { storage } from "@/lib/storage";
export const Route = createFileRoute("/ask")({ component: AskPage });
function AskPage() {
  const voice = useVoiceSession();
  const [typed, setTyped] = useState("");
  const [languageCode, setLanguageCode] = useState<DamiLanguageCode>(
    () => storage.getSettings().speechLanguage,
  );
  const avatarActivationRef = useRef(false);
  const listening = voice.stage === "listening",
    busy = voice.isBusy,
    selectedLanguage = useMemo(() => getDamiLanguage(languageCode), [languageCode]);
  const changeLanguage = (value: DamiLanguageCode) => {
    const language = getDamiLanguage(value),
      current = storage.getSettings();
    storage.setSettings({
      ...current,
      speechLanguage: value,
      codeSwitching: language.codeSwitched,
      voiceAccent: language.preferredAccent,
    });
    setLanguageCode(value);
  };
  const activateAvatar = async () => {
    if (avatarActivationRef.current || listening || busy) return;
    avatarActivationRef.current = true;
    try {
      if (voice.stage === "speaking") voice.stopSpeaking();
      await voice.startListening();
    } finally {
      avatarActivationRef.current = false;
    }
  };
  return (
    <AppShell>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr] lg:gap-10">
        <aside className="flex flex-col items-center gap-4 text-center">
          <button
            type="button"
            onClick={() => void activateAvatar()}
            disabled={listening || busy}
            className="rounded-full bg-transparent p-0 outline-none transition-transform hover:scale-[1.025] focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait"
            aria-label="Click or double-click Dami to start talking"
          >
            <DamiAvatar state={voice.robotState} size={170} level={voice.level} />
          </button>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{voice.statusText}</p>
            <p className="text-xs text-primary">Click or double-click Dami to talk</p>
            <p className="text-xs text-muted-foreground/80">
              Listening mode: {selectedLanguage.shortLabel}
            </p>
          </div>
          <label className="w-full text-left text-xs font-medium text-muted-foreground">
            Voice language
            <select
              value={languageCode}
              disabled={listening || busy}
              onChange={(e) => changeLanguage(e.target.value as DamiLanguageCode)}
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {DAMI_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex w-full justify-center gap-2">
            {listening ? (
              <>
                <Button className="flex-1" onClick={() => void voice.stopListening()}>
                  <Square className="mr-2 h-4 w-4" />
                  Done speaking
                </Button>
                <Button variant="ghost" onClick={voice.cancelListening}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button
                size="lg"
                className="w-full"
                disabled={busy}
                onClick={() => void voice.startListening()}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Mic className="mr-2 h-5 w-5" />
                )}
                {busy ? "Working…" : "Talk with Dami"}
              </Button>
            )}
          </div>
          <form
            className="w-full space-y-2 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              const text = typed.trim();
              if (!text) return;
              setTyped("");
              void voice.ask(text);
            }}
          >
            <label htmlFor="typed-question" className="text-xs text-muted-foreground">
              Prefer to type? Ask here instead.
            </label>
            <Textarea
              id="typed-question"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Ask a legal question…"
              rows={3}
            />
            <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
              <Send className="mr-2 h-4 w-4" />
              Ask Dami
            </Button>
          </form>
        </aside>
        <section className="min-w-0 space-y-4 sm:space-y-6">
          {(listening || voice.stage === "transcribing" || voice.transcript) && (
            <div className="border bg-card p-4 sm:p-5" aria-live="polite">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {voice.transcript ? "Original voice transcript" : "Live transcript"}
                </p>
                {voice.transcript && (
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {voice.transcript.engine === "sahara-stt"
                      ? "Sahara STT"
                      : "Resilience transcript"}
                  </span>
                )}
              </div>
              <p className="min-h-12 whitespace-pre-wrap text-base leading-7">
                {voice.transcript?.originalTranscript ||
                  voice.partial ||
                  "Start speaking and your words will appear here…"}
              </p>
              {voice.transcript?.engine !== "sahara-stt" && voice.transcript && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Sahara was unavailable for this turn, so Dami used the Windows resilience
                  transcript. Retry before using this turn as benchmark evidence.
                </p>
              )}
            </div>
          )}
          {voice.stage === "error" && voice.error && (
            <Alert>
              <AlertTitle>Dami hit a snag</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{voice.error}</p>
                <Button size="sm" variant="outline" onClick={voice.retry}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {voice.answer && voice.question ? (
            <AnswerPanel
              question={voice.question}
              answer={voice.answer}
              session={voice.session}
              speaking={voice.stage === "speaking"}
              paused={voice.speechPaused}
              onReadAloud={() => void voice.readAloud(voice.answer!.answer)}
              onToggleSpeech={voice.toggleSpeechPause}
            />
          ) : (
            !busy &&
            !listening &&
            voice.stage !== "error" && (
              <div className="rounded-xl border border-dashed p-6 text-center sm:p-10">
                <h1 className="text-xl font-semibold sm:text-2xl">Ask Dami</h1>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Tell Dami your legal question, jurisdiction or task in your own words. Dami will
                  research useful authorities and explain the result with sources.
                </p>
              </div>
            )
          )}
          {busy && voice.stage !== "transcribing" && (
            <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground sm:p-10">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" />
              {voice.statusText}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
