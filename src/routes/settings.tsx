import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DAMI_LANGUAGES } from "@/lib/languages";
import { storage } from "@/lib/storage";
import type { DamiSettings } from "@/lib/types";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-primary"
      />
    </label>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState<DamiSettings>(() => storage.getSettings());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(storage.getSettings());
  }, []);

  const update = <K extends keyof DamiSettings>(key: K, value: DamiSettings[K]) => {
    setSaved(false);
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    storage.setSettings(settings);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose how Dami listens, speaks and behaves on the web and desktop.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Voice</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="block text-sm font-medium">
              Language
              <select
                value={settings.speechLanguage}
                onChange={(event) => update("speechLanguage", event.target.value as DamiSettings["speechLanguage"])}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {DAMI_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>{language.label}</option>
                ))}
              </select>
            </label>
            <ToggleRow
              title="Speak answers aloud"
              description="Dami reads researched answers back to you using the configured Sahara voice."
              checked={settings.speakAnswers}
              onChange={(value) => update("speakAnswers", value)}
            />
            <ToggleRow
              title="Code-switching"
              description="Allow supported African-language and English switching during voice input."
              checked={settings.codeSwitching}
              onChange={(value) => update("codeSwitching", value)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
          <CardContent>
            <label className="block text-sm font-medium">
              Theme
              <select
                value={settings.theme}
                onChange={(event) => update("theme", event.target.value as DamiSettings["theme"])}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Dami Desktop</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border/60">
            <ToggleRow
              title='Wake with “Hey Dami”'
              description="On the installed desktop app, saying Hey Dami wakes the assistant before your legal question."
              checked={settings.wakeWordEnabled}
              onChange={(value) => update("wakeWordEnabled", value)}
            />
            <ToggleRow
              title="Floating Dami"
              description="Keep the Dami avatar available above your desktop while the app is running."
              checked={settings.floatingAvatarEnabled}
              onChange={(value) => update("floatingAvatarEnabled", value)}
            />
            <ToggleRow
              title="Launch at startup"
              description="Start Dami automatically when you sign in to your computer."
              checked={settings.launchAtStartup}
              onChange={(value) => update("launchAtStartup", value)}
            />
            <label className="block py-3 text-sm font-medium">
              Floating position
              <select
                value={settings.desktopDock}
                onChange={(event) => update("desktopDock", event.target.value as DamiSettings["desktopDock"])}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={save}>Save settings</Button>
          {saved && <span className="text-sm text-primary">Saved</span>}
        </div>
      </div>
    </AppShell>
  );
}
