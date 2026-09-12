export type DesktopDock = "top" | "bottom";

export interface DesktopSettingsSnapshot {
  desktopDock: DesktopDock;
  wakeWordEnabled: boolean;
  floatingAvatarEnabled: boolean;
  launchAtStartup: boolean;
}

export interface DamiDesktopBridge {
  isDesktop: true;
  getDock(): Promise<DesktopDock>;
  getDesktopSettings(): Promise<DesktopSettingsSnapshot>;
  setDock(dock: DesktopDock): Promise<DesktopDock>;
  setLaunchAtStartup(enabled: boolean): Promise<boolean>;
  setWakeWordEnabled(enabled: boolean): Promise<boolean>;
  setFloatingAvatarEnabled(enabled: boolean): Promise<boolean>;
  show(): Promise<unknown>;
  hide(): Promise<unknown>;
}

declare global {
  interface Window {
    damiDesktop?: DamiDesktopBridge;
  }
}

export function getDesktopBridge(): DamiDesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.damiDesktop ?? null;
}
