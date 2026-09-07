import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Globe2, Mic, ScrollText, ShieldCheck } from "lucide-react";
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
      { title: "Dami AI — A Voice for Justice across Africa" },
      {
        name: "description",
        content:
          "Dami is an African legal AI agent for legal research, legal information and source-grounded assistance across jurisdictions and legal practice workflows.",
      },
      { property: "og:title", content: "Dami AI — A Voice for Justice across Africa" },
      {
        property: "og:description",
        content:
          "Voice-first African legal intelligence with multilingual speech, source-grounded research and practitioner-focused assistance.",
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

  return (
    <AppShell>
      <section className="flex flex-col items-center gap-8 py-6 text-center">
        <DamiAvatar state="welcome" size={240} />
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
            A Voice for Justice
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            African legal intelligence you can talk to
          </h1>
          <p className="mx-auto max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
            Dami listens naturally, understands the jurisdiction and legal task you are asking about,
            researches available authorities, and returns a useful answer with sources you can verify.
            It is built for lawyers, legal researchers, students, public-service teams and people who
            need clearer access to legal information.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="shadow-[var(--shadow-lift)]">
            <Link to="/ask">
              <Mic className="mr-2 h-5 w-5" /> Talk with Dami
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/research">
              <Globe2 className="mr-2 h-5 w-5" /> Research with Dami
            </Link>
          </Button>
        </div>
      </section>

      <section className="mt-14 grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Mic,
            title: "Speak naturally",
            body: "Use an African-accented voice or switch between the launch languages. Dami listens, follows the conversation and can speak the answer back.",
          },
          {
            icon: ScrollText,
            title: "Research that earns trust",
            body: "Dami prioritizes authoritative legal sources, explains why they matter and shows the authorities behind the answer instead of returning generic search snippets.",
          },
          {
            icon: ShieldCheck,
            title: "Useful, not overconfident",
            body: "Dami separates verified law from uncertainty, identifies jurisdiction limits and tells you when stronger authority or qualified legal advice is needed.",
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
                  <Link
                    to="/research"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
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
