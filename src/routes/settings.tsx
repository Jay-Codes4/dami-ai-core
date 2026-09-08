import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDesktopBridge } from "@/lib/desktop";
import { DAMI_LANGUAGES } from "@/lib/languages";
import { storage } from "@/lib/storage";
import type { DamiSettings } from "@/lib/types";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function applyTheme(theme: DamiSettings["theme"]) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-start justify-between gap-4 py-3"><span><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-primary" /></label>;
}

function SettingsPage() {
  const [settings, setSettings] = useState<DamiSettings>(() => storage.getSettings());
  const [saved, setSaved] = useState(false);
  const [desktopConnected, setDesktopConnected] = useState(false);

  useEffect(() => {
    setSettings(storage.getSettings());
    setDesktopConnected(Boolean(getDesktopBridge()));
  }, []);

  const update = <K extends keyof DamiSettings>(key: K, value: DamiSettings[K]) => {
    setSaved(false);
    setSettings((current) => {
      const next = { ...current, [key]: value };
      storage.setSettings(next);
      if (key === "theme") applyTheme(value as DamiSettings["theme"]);
      const bridge = getDesktopBridge();
      if (bridge && key === "desktopDock") void bridge.setDock(value as DamiSettings["desktopDock"]);
      if (bridge && key === "launchAtStartup") void bridge.setLaunchAtStartup(Boolean(value));
      if (bridge && key === "floatingAvatarEnabled") {
        if (value) void bridge.show(); else void bridge.hide();
      }
      return next;
    });
  };

  const save = async () => {
    storage.setSettings(settings);
    const bridge = getDesktopBridge();
    if (bridge) {
      await Promise.allSettled([
        bridge.setDock(settings.desktopDock),
        bridge.setLaunchAtStartup(settings.launchAtStartup),
      ]);
    }
    applyTheme(settings.theme);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <AppShell><div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-3xl font-semibold tracking-tight">Settings</h1><p className="mt-2 text-sm text-muted-foreground">Choose how Dami listens, speaks and behaves on the web and desktop.</p></div>
      <Card><CardHeader><CardTitle className="text-base">Voice</CardTitle></CardHeader><CardContent className="space-y-4">
        <label className="block text-sm font-medium">Language<select value={settings.speechLanguage} onChange={(e) => update("speechLanguage", e.target.value as DamiSettings["speechLanguage"])} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{DAMI_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
        <ToggleRow title="Speak answers aloud" description="Dami reads researched answers back to you using the configured Sahara voice." checked={settings.speakAnswers} onChange={(v) => update("speakAnswers", v)} />
        <ToggleRow title="Code-switching" description="Allow supported African-language and English switching during voice input." checked={settings.codeSwitching} onChange={(v) => update("codeSwitching", v)} />
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader><CardContent><label className="block text-sm font-medium">Theme<select value={settings.theme} onChange={(e) => update("theme", e.target.value as DamiSettings["theme"])} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Dami Desktop</CardTitle></CardHeader><CardContent className="divide-y divide-border/60">
        <p className="pb-2 text-xs text-muted-foreground">{desktopConnected ? "Desktop controls connected." : "Desktop controls apply when this page is opened inside the installed Dami app."}</p>
        <ToggleRow title='Wake with "Hey Dami"' description="On the installed desktop app, saying Hey Dami wakes the assistant before your legal question." checked={settings.wakeWordEnabled} onChange={(v) => update("wakeWordEnabled", v)} />
        <ToggleRow title="Floating Dami" description="Keep the Dami avatar available above your desktop while the app is running." checked={settings.floatingAvatarEnabled} onChange={(v) => update("floatingAvatarEnabled", v)} />
        <ToggleRow title="Launch at startup" description="Start Dami automatically when you sign in to your computer." checked={settings.launchAtStartup} onChange={(v) => update("launchAtStartup", v)} />
        <label className="block py-3 text-sm font-medium">Floating position<select value={settings.desktopDock} onChange={(e) => update("desktopDock", e.target.value as DamiSettings["desktopDock"])} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
      </CardContent></Card>
      <div className="flex items-center gap-3"><Button onClick={() => void save()}>Save settings</Button>{saved && <span className="text-sm text-primary">Saved and applied</span>}</div>
    </div></AppShell>
  );
}
