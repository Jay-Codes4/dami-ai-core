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

function ToggleRow({ title, description, checked, onChange, disabled = false }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-start justify-between gap-4 py-3"><span><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-primary disabled:opacity-50" /></label>;
}

function SettingsPage() {
  const [settings, setSettings] = useState<DamiSettings>(() => storage.getSettings());
  const [saved, setSaved] = useState(false);
  const [desktopConnected, setDesktopConnected] = useState(false);
  const [desktopError, setDesktopError] = useState<string | null>(null);

  useEffect(() => {
    const local = storage.getSettings();
    const bridge = getDesktopBridge();
    setDesktopConnected(Boolean(bridge));
    if (!bridge) {
      setSettings(local);
      return;
    }
    void bridge.getDesktopSettings().then((desktopSettings) => {
      const merged: DamiSettings = {
        ...local,
        desktopDock: desktopSettings.desktopDock,
        wakeWordEnabled: desktopSettings.wakeWordEnabled,
        floatingAvatarEnabled: desktopSettings.floatingAvatarEnabled,
        launchAtStartup: desktopSettings.launchAtStartup,
      };
      storage.setSettings(merged);
      setSettings(merged);
      setDesktopError(null);
    }).catch((error) => {
      console.error("Could not sync Dami desktop settings", error);
      setSettings(local);
      setDesktopError("Desktop controls could not be read. The web settings are still available.");
    });
  }, []);

  const update = <K extends keyof DamiSettings>(key: K, value: DamiSettings[K]) => {
    setSaved(false);
    setDesktopError(null);
    setSettings((current) => {
      const next = { ...current, [key]: value };
      storage.setSettings(next);
      if (key === "theme") applyTheme(value as DamiSettings["theme"]);
      const bridge = getDesktopBridge();
      if (bridge) {
        let task: Promise<unknown> | null = null;
        if (key === "desktopDock") task = bridge.setDock(value as DamiSettings["desktopDock"]);
        if (key === "launchAtStartup") task = bridge.setLaunchAtStartup(Boolean(value));
        if (key === "wakeWordEnabled") task = bridge.setWakeWordEnabled(Boolean(value));
        if (key === "floatingAvatarEnabled") task = bridge.setFloatingAvatarEnabled(Boolean(value));
        if (task) void task.catch((error) => {
          console.error("Could not apply desktop setting", key, error);
          setDesktopError("That desktop setting could not be applied. Try again after restarting Dami.");
        });
      }
      return next;
    });
  };

  const save = async () => {
    storage.setSettings(settings);
    const bridge = getDesktopBridge();
    if (bridge) {
      const results = await Promise.allSettled([
        bridge.setDock(settings.desktopDock),
        bridge.setLaunchAtStartup(settings.launchAtStartup),
        bridge.setWakeWordEnabled(settings.wakeWordEnabled),
        bridge.setFloatingAvatarEnabled(settings.floatingAvatarEnabled),
      ]);
      if (results.some((result) => result.status === "rejected")) {
        setDesktopError("Some desktop settings could not be applied. Restart Dami and try again.");
        return;
      }
    }
    applyTheme(settings.theme);
    setDesktopError(null);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <AppShell><div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-3xl font-semibold tracking-tight">Settings</h1><p className="mt-2 text-sm text-muted-foreground">These settings are live across Dami's voice, research experience and installed desktop companion.</p></div>

      <Card><CardHeader><CardTitle className="text-base">Voice & listening</CardTitle></CardHeader><CardContent className="space-y-4">
        <label className="block text-sm font-medium">Language<select value={settings.speechLanguage} onChange={(e) => update("speechLanguage", e.target.value as DamiSettings["speechLanguage"])} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{DAMI_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
        <ToggleRow title="Speak answers aloud" description="Read answers aloud. Desktop Dami uses the local voice fallback when Sahara is unavailable." checked={settings.speakAnswers} onChange={(v) => update("speakAnswers", v)} />
        <ToggleRow title="Code-switching" description="Allow supported African-language and English switching during voice input." checked={settings.codeSwitching} onChange={(v) => update("codeSwitching", v)} />
        <label className="block text-sm font-medium">Maximum listening time<select value={settings.maxRecordingSeconds} onChange={(e) => update("maxRecordingSeconds", Number(e.target.value))} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={120}>2 minutes</option></select></label>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader><CardContent><label className="block text-sm font-medium">Theme<select value={settings.theme} onChange={(e) => update("theme", e.target.value as DamiSettings["theme"])} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Dami Desktop</CardTitle></CardHeader><CardContent className="divide-y divide-border/60">
        <p className="pb-2 text-xs text-muted-foreground">{desktopConnected ? "Connected to the installed Dami desktop app. Changes apply immediately." : "Open Settings inside the installed Dami app to control Windows-specific behaviour."}</p>
        {desktopError && <p className="pb-2 text-xs text-destructive">{desktopError}</p>}
        <ToggleRow title={'Wake with "Hey Dami"'} description="Keep the wake listener active in the background, even while Dami's avatar is hidden behind another program." checked={settings.wakeWordEnabled} onChange={(v) => update("wakeWordEnabled", v)} disabled={!desktopConnected} />
        <ToggleRow title="Desktop avatar" description="Show Dami only while the Windows desktop is active. She automatically hides when another app is in front." checked={settings.floatingAvatarEnabled} onChange={(v) => update("floatingAvatarEnabled", v)} disabled={!desktopConnected} />
        <ToggleRow title="Launch at startup" description="Start Dami automatically when you sign in to Windows." checked={settings.launchAtStartup} onChange={(v) => update("launchAtStartup", v)} disabled={!desktopConnected} />
        <label className="block py-3 text-sm font-medium">Desktop position<select value={settings.desktopDock} disabled={!desktopConnected} onChange={(e) => update("desktopDock", e.target.value as DamiSettings["desktopDock"])} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"><option value="top">Top right</option><option value="bottom">Bottom right</option></select></label>
      </CardContent></Card>

      <div className="flex items-center gap-3"><Button onClick={() => void save()}>Save settings</Button>{saved && <span className="text-sm text-primary">Saved and applied</span>}</div>
    </div></AppShell>
  );
}
