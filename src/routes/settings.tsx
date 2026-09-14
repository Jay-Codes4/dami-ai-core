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
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-primary disabled:opacity-50"
      />
    </label>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState<DamiSettings>(() => storage.getSettings()),
    [saved, setSaved] = useState(false),
    [desktopConnected, setDesktopConnected] = useState(false),
    [desktopError, setDesktopError] = useState<string | null>(null);

  useEffect(() => {
    const local = storage.getSettings(),
      bridge = getDesktopBridge();
    setDesktopConnected(Boolean(bridge));
    if (!bridge) return;
    void bridge
      .getDesktopSettings()
      .then((desktopSettings) => {
        const merged: DamiSettings = {
          ...local,
          wakeWordEnabled: desktopSettings.wakeWordEnabled,
          floatingAvatarEnabled: desktopSettings.floatingAvatarEnabled,
          launchAtStartup: desktopSettings.launchAtStartup,
        };
        storage.setSettings(merged);
        setSettings(merged);
      })
      .catch(() => setDesktopError("Desktop controls could not be read. Web settings still work."));
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
        if (key === "launchAtStartup") task = bridge.setLaunchAtStartup(Boolean(value));
        if (key === "wakeWordEnabled") task = bridge.setWakeWordEnabled(Boolean(value));
        if (key === "floatingAvatarEnabled") task = bridge.setFloatingAvatarEnabled(Boolean(value));
        if (task)
          void task.catch(() =>
            setDesktopError("That desktop setting could not be applied. Restart Dami and retry."),
          );
      }
      return next;
    });
  };

  const save = async () => {
    storage.setSettings(settings);
    const bridge = getDesktopBridge();
    if (bridge) {
      const results = await Promise.allSettled([
        bridge.setLaunchAtStartup(settings.launchAtStartup),
        bridge.setWakeWordEnabled(settings.wakeWordEnabled),
        bridge.setFloatingAvatarEnabled(settings.floatingAvatarEnabled),
      ]);
      if (results.some((result) => result.status === "rejected")) {
        setDesktopError("Some desktop settings could not be applied. Restart Dami and retry.");
        return;
      }
    }
    applyTheme(settings.theme);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            These settings are live across Dami's web and installed desktop companion.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voice & listening</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block text-sm font-medium">
              Language
              <select
                value={settings.speechLanguage}
                onChange={(event) => {
                  const value = event.target.value as DamiSettings["speechLanguage"],
                    language = DAMI_LANGUAGES.find((item) => item.code === value)!;
                  update("speechLanguage", value);
                  update("voiceAccent", language.preferredAccent);
                }}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {DAMI_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
            <ToggleRow
              title="Speak answers aloud"
              description="Use Dami's African female voice. The complete written answer remains visible."
              checked={settings.speakAnswers}
              onChange={(value) => update("speakAnswers", value)}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Igbo and Nigerian Pidgin automatically keep code-switching with English active; you
              never need to change language mid-sentence.
            </p>
            <label className="block text-sm font-medium">
              Maximum listening time
              <select
                value={settings.maxRecordingSeconds}
                onChange={(event) => update("maxRecordingSeconds", Number(event.target.value))}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
              </select>
            </label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
          </CardHeader>
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
          <CardHeader>
            <CardTitle className="text-base">Dami Desktop</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/60">
            <p className="pb-2 text-xs text-muted-foreground">
              {desktopConnected
                ? "Connected to the installed Dami desktop app. Changes apply immediately."
                : "Open Settings inside the installed app for Windows-specific controls."}
            </p>
            {desktopError && <p className="pb-2 text-xs text-destructive">{desktopError}</p>}
            <ToggleRow
              title={'Wake with "Hey Dami"'}
              description="Keep the background wake listener active."
              checked={settings.wakeWordEnabled}
              onChange={(value) => update("wakeWordEnabled", value)}
              disabled={!desktopConnected}
            />
            <ToggleRow
              title="Desktop avatar"
              description="Show the lightweight floating Dami companion."
              checked={settings.floatingAvatarEnabled}
              onChange={(value) => update("floatingAvatarEnabled", value)}
              disabled={!desktopConnected}
            />
            <ToggleRow
              title="Launch at startup"
              description="Start Dami when you sign in to Windows."
              checked={settings.launchAtStartup}
              onChange={(value) => update("launchAtStartup", value)}
              disabled={!desktopConnected}
            />
          </CardContent>
        </Card>
        <div className="flex items-center gap-3">
          <Button onClick={() => void save()}>Save settings</Button>
          {saved && <span className="text-sm text-primary">Saved and applied</span>}
        </div>
      </div>
    </AppShell>
  );
}
