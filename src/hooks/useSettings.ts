import { useCallback, useEffect, useState } from "react";

import { STORAGE_EVENT, storage } from "@/lib/storage";
import { DEFAULT_SETTINGS, type DamiSettings } from "@/lib/types";

export function useSettings() {
  const [settings, setSettings] = useState<DamiSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(storage.getSettings());
    const onChange = () => setSettings(storage.getSettings());
    window.addEventListener(STORAGE_EVENT, onChange);
    return () => window.removeEventListener(STORAGE_EVENT, onChange);
  }, []);

  const update = useCallback((patch: Partial<DamiSettings>) => {
    const next = { ...storage.getSettings(), ...patch };
    storage.setSettings(next);
    setSettings(next);
  }, []);

  return { settings, update };
}
