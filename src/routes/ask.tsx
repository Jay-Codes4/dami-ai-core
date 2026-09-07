import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Mic, Send, Square, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AnswerPanel } from "@/components/AnswerPanel";
import { AppShell } from "@/components/AppShell";
import { DamiAvatar } from "@/components/DamiAvatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { DAMI_LANGUAGES, getDamiLanguage, type DamiLanguageCode } from "@/lib/languages";
import { storage } from "@/lib/storage";

export const Route = createFileRoute("/ask")({
  head: () => ({
    meta: [
      { title: "Ask Dami — African legal AI agent" },
      {
        name: "description",
        content:
          "Speak or type a legal question and Dami researches available authorities, explains the answer clearly and shows the sources behind it.",
      },
      { property: "og:title", content: "Ask Dami — African legal AI agent" },
      {
        property: "og:description",
        content: "Voice-first legal research and assistance for African legal practitioners and legal-information users.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AskPage,
});

function AskPage() {
  const voice = useVoiceSession();
  const [typed, setTyped] = useState("");
  const [languageCode, setLanguageCode] = useState<DamiLanguageCode>(() => storage.getSettings().speechLanguage);

  const listening = voice.stage === "listening";
  const busy = voice.isBusy;
  const selectedLanguage = useMemo(() => getDamiLanguage(languageCode), [languageCode]);

  const changeLanguage = (value: DamiLanguageCode) => {
    const language = getDamiLanguage(value);
    const current = storage.getSettings();
    storage.setSettings({
      ...current,
      speechLanguage: value,
      codeSwitching: language.codeSwitched,
      voiceAccent: language.preferredAccent,
    });
    setLanguageCode(value);
  };

  return (
    <AppShell>
      <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col items-center gap-5 text-center">
          <DamiAvatar state={voice.robotState} size={200} level={voice.level} />
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{voice.statusText}</p>
            <p className="text-xs text-muted-foreground/80">
              Listening mode: {selectedLanguage.shortLabel}
            </p>
          </div>

          <label className="w-full text-left text-xs font-medium text-muted-foreground">
            Voice language
            <select
              value={languageCode}
              disabled={listening || busy}
              onChange={(event) => changeLanguage(event.target.value as DamiLanguageCode)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {DAMI_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap justify-center gap-2">
            {listening ? (
              <>
                <Button onClick={() => void voice.stopListening()}>
                  <Square className="mr-2 h-4 w-4" /> Done speaking
                </Button>
                <Button variant="ghost" onClick={voice.cancelListening}>
                  <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
              </>
            ) : (
              <Button
                size="lg"
                disabled={busy}
                onClick={() => void voice.startListening()}
                className="shadow-[var(--shadow-lift)]"
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
            onSubmit={(event) => {
              event.preventDefault();
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
              onChange={(event) => setTyped(event.target.value)}
              placeholder="e.g. Find the strongest authorities on unlawful detention in my jurisdiction and explain what they mean."
              rows={4}
            />
            <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
              <Send className="mr-2 h-4 w-4" /> Ask Dami
            </Button>
          </form>
        </aside>

        <section className="space-y-6">
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
              onReadAloud={() => void voice.readAloud(voice.answer!.answer)}
              onStopSpeaking={voice.stopSpeaking}
            />
          ) : (
            !busy &&
            voice.stage !== "error" && (
              <div className="rounded-xl border border-dashed border-border/70 p-10 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">Ask Dami</h1>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Tell Dami the legal question, jurisdiction or task in your own words. Dami will
                  identify what you need, research the strongest available authorities and explain
                  the result with sources rather than handing you a page of generic links.
                </p>
              </div>
            )
          )}

          {busy && (
            <div className="rounded-xl border border-border/70 p-10 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" />
              {voice.statusText}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
