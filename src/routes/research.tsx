import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AnswerPanel } from "@/components/AnswerPanel";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STORAGE_EVENT, storage } from "@/lib/storage";
import type { ResearchSession } from "@/lib/types";

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "Saved research — Dami AI" },
      {
        name: "description",
        content:
          "Revisit every legal question you have asked Dami, together with the Ghanaian authorities behind each answer.",
      },
      { property: "og:title", content: "Saved research — Dami AI" },
      {
        property: "og:description",
        content: "Your past legal questions and the Ghanaian authorities behind each answer.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setSessions(storage.listSessions());
    load();
    window.addEventListener(STORAGE_EVENT, load);
    return () => window.removeEventListener(STORAGE_EVENT, load);
  }, []);

  const open = sessions.find((session) => session.id === openId) ?? null;

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tight">Saved research</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Everything you have asked Dami on this device.
      </p>

      {sessions.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">
          Nothing yet. Ask Dami a question and it will show up here.
        </p>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[340px_1fr]">
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card
                key={session.id}
                className={`cursor-pointer shadow-[var(--shadow-soft)] transition-colors ${
                  session.id === openId ? "border-primary" : ""
                }`}
                onClick={() => setOpenId(session.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm leading-snug">{session.question}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{new Date(session.createdAt).toLocaleString("en-GB")}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete this research"
                    onClick={(event) => {
                      event.stopPropagation();
                      storage.deleteSession(session.id);
                      setSessions(storage.listSessions());
                      if (openId === session.id) setOpenId(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div>
            {open ? (
              <AnswerPanel question={open.question} answer={open.answer} session={open} />
            ) : (
              <p className="rounded-xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">
                Pick a question to read the full answer.
              </p>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
