export type DesktopDock = "top" | "bottom";

export interface DamiDesktopBridge {
  isDesktop: true;
  getDock(): Promise<DesktopDock>;
  setDock(dock: DesktopDock): Promise<DesktopDock>;
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
