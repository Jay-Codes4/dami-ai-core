import { Link, createFileRoute } from "@tanstack/react-router";
import { Download, Mic2, MonitorUp, Sparkles } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { DamiAvatar } from "@/components/DamiAvatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const WINDOWS_DOWNLOAD =
  "https://github.com/Jay-Codes4/dami-ai-core/releases/latest/download/Dami-Setup.exe";

export const Route = createFileRoute("/desktop")({
  head: () => ({ meta: [{ title: "Dami Desktop — Dami AI" }] }),
  component: DesktopPage,
});

function DesktopPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-10">
        <section className="grid items-center gap-8 rounded-3xl border border-border/60 bg-card p-6 shadow-[var(--shadow-soft)] md:grid-cols-[1fr_260px] md:p-10">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Dami Desktop</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Keep Dami within reach on your PC</h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Dami floats on your desktop, wakes when you say “Hey Dami”, listens to your question and brings the legal research back without making you open the browser first.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href={WINDOWS_DOWNLOAD}>
                  <Download className="mr-2 h-5 w-5" /> Install Dami for Windows
                </a>
              </Button>
              <Button asChild variant="outline" size="lg"><Link to="/ask">Use Dami on the web</Link></Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Windows 10/11 · 64-bit. Dami can launch with your PC and stay available as a small floating assistant.
            </p>
          </div>
          <div className="flex justify-center"><DamiAvatar state="welcome" size={220} /></div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            { icon: MonitorUp, title: "Floating Dami", body: "Keep the avatar available above your desktop and click it whenever you want help." },
            { icon: Mic2, title: 'Say “Hey Dami”', body: "Wake Dami by voice, then ask your question naturally instead of opening a new window first." },
            { icon: Sparkles, title: "Same legal brain", body: "Desktop Dami uses the same Sahara voice pipeline, legal research and source-grounded answers as the web app." },
          ].map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader><Icon className="h-5 w-5 text-primary" /><CardTitle className="text-base">{title}</CardTitle></CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">{body}</CardContent>
            </Card>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
