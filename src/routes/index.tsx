import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Mic, ScrollText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { DamiAvatar } from "@/components/DamiAvatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STORAGE_EVENT, storage } from "@/lib/storage";
import type { ResearchSession } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dami AI — A Voice for Justice in Ghana" },
      {
        name: "description",
        content:
          "Ask legal questions out loud and get plain-language answers grounded in verified Ghanaian legislation, the Constitution and official public sources.",
      },
      { property: "og:title", content: "Dami AI — A Voice for Justice in Ghana" },
      {
        property: "og:description",
        content:
          "Voice-first legal research for Ghana, grounded in the Constitution, Acts of Parliament and official public sources.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function useSessions() {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  useEffect(() => {
    const load = () => setSessions(storage.listSessions());
    load();
    window.addEventListener(STORAGE_EVENT, load);
    return () => window.removeEventListener(STORAGE_EVENT, load);
  }, []);
  return sessions;
}

function Home() {
  const sessions = useSessions().slice(0, 3);
  const navigate = useNavigate();

  return (
    <AppShell>
      <section className="flex flex-col items-center gap-8 py-6 text-center">
        <div className="space-y-2">
          <DamiAvatar
            state="welcome"
            size={240}
            activationLabel="Talk with Dami"
            onActivate={() => void navigate({ to: "/ask" })}
          />
          <p className="text-xs font-medium text-muted-foreground">Tap Dami to start</p>
        </div>
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
            A Voice for Justice
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Ask Ghanaian legal questions out loud
          </h1>
          <p className="mx-auto max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
            Dami listens, researches the Constitution, Acts of Parliament and official public
            sources, then explains what it found in plain language — with every authority linked so
            you can check it yourself.
          </p>
        </div>
        <Button asChild size="lg" className="shadow-[var(--shadow-lift)]">
          <Link to="/ask">
            <Mic className="mr-2 h-5 w-5" /> Talk with Dami
          </Link>
        </Button>
      </section>

      <section className="mt-14 grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Mic,
            title: "Speak naturally",
            body: "Ask in English or Ghanaian-accented English. Dami transcribes, researches and can read the answer back to you.",
          },
          {
            icon: ScrollText,
            title: "Grounded in real law",
            body: "Answers are built only from verified Ghanaian sources. Nothing is invented, and every citation links to its official home.",
          },
          {
            icon: ShieldCheck,
            title: "Honest about limits",
            body: "When the sources don't answer your question, Dami says so instead of guessing, and points you toward legal aid.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <Card key={title} className="shadow-[var(--shadow-soft)]">
            <CardHeader className="space-y-2">
              <Icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              {body}
            </CardContent>
          </Card>
        ))}
      </section>

      {sessions.length > 0 && (
        <section className="mt-14 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent research</h2>
            <Link to="/research" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {sessions.map((session) => (
              <Card key={session.id} className="shadow-[var(--shadow-soft)]">
                <CardHeader>
                  <CardTitle className="text-sm leading-snug">{session.question}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p className="line-clamp-3">{session.answer.answer}</p>
                  <Link to="/research" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
