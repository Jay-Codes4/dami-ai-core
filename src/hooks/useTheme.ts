import { useCallback, useEffect, useState } from "react";

import { storage } from "@/lib/storage";
import type { DamiSettings } from "@/lib/types";

type Theme = DamiSettings["theme"];

function apply(theme: Theme): void {
  if (typeof document === "undefined") return;
  const prefersDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", prefersDark);
  document.documentElement.style.colorScheme = prefersDark ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = storage.getSettings().theme;
    setThemeState(stored);
    apply(stored);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (storage.getSettings().theme === "system") apply("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    apply(next);
    storage.setSettings({ ...storage.getSettings(), theme: next });
  }, []);

  const toggle = useCallback(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "light" : "dark");
  }, [setTheme]);

  return { theme, setTheme, toggle };
}
