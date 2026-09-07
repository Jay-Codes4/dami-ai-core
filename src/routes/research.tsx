import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Loader2, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AnswerPanel } from "@/components/AnswerPanel";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STORAGE_EVENT, storage } from "@/lib/storage";
import type { ResearchSession } from "@/lib/types";
import type { WebSearchResult } from "@/services/tools/interfaces";
import { searchOfficialSources } from "@/services/tools/web.client";

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
  const [webResults, setWebResults] = useState<WebSearchResult[]>([]);
  const [webBusy, setWebBusy] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => setSessions(storage.listSessions());
    load();
    window.addEventListener(STORAGE_EVENT, load);
    return () => window.removeEventListener(STORAGE_EVENT, load);
  }, []);

  const open = sessions.find((session) => session.id === openId) ?? null;

  useEffect(() => {
    setWebResults([]);
    setWebError(null);
  }, [openId]);

  const searchWeb = async () => {
    if (!open || webBusy) return;
    setWebBusy(true);
    setWebError(null);
    try {
      setWebResults(await searchOfficialSources(open.question));
    } catch (error) {
      setWebError(error instanceof Error ? error.message : "Dami couldn't search official sources.");
    } finally {
      setWebBusy(false);
    }
  };

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

          <div className="space-y-6">
            {open ? (
              <>
                <AnswerPanel question={open.question} answer={open.answer} session={open} />

                <section className="rounded-xl border border-border/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">Search official sources online</h2>
                      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                        Dami can look for additional material on approved Ghanaian legal and public-service websites. These results are shown separately and do not silently change the saved answer.
                      </p>
                    </div>
                    <Button variant="outline" disabled={webBusy} onClick={() => void searchWeb()}>
                      {webBusy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="mr-2 h-4 w-4" />
                      )}
                      {webBusy ? "Searching…" : "Search official web"}
                    </Button>
                  </div>

                  {webError && <p className="mt-4 text-sm text-destructive">{webError}</p>}

                  {webResults.length > 0 && (
                    <div className="mt-5 space-y-3">
                      {webResults.map((result) => (
                        <a
                          key={result.url}
                          href={result.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-lg border border-border/70 p-4 transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-sm font-medium leading-snug">{result.title}</h3>
                              {result.snippet && (
                                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                                  {result.snippet}
                                </p>
                              )}
                            </div>
                            <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </section>
              </>
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
