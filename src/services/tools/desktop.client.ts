export interface DesktopFile {
  name: string;
  path: string;
  content: string;
}

export interface DesktopBridge {
  platform: string;
  isDesktop: true;
  openFile(): Promise<DesktopFile | null>;
  saveFile(input: { suggestedName?: string; content: string }): Promise<{ path: string } | null>;
  writeClipboard(text: string): Promise<boolean>;
  notify(input: { title?: string; body?: string }): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
}

declare global {
  interface Window {
    damiDesktop?: DesktopBridge;
  }
}

export function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && window.damiDesktop?.isDesktop === true;
}

export async function chooseDesktopFile(): Promise<DesktopFile | null> {
  if (!window.damiDesktop) throw new Error("Desktop file access is unavailable in this browser session.");
  return window.damiDesktop.openFile();
}

export async function saveDesktopFile(
  content: string,
  suggestedName = "dami-research-note.md",
): Promise<{ path: string } | null> {
  if (!window.damiDesktop) throw new Error("Desktop file saving is unavailable in this browser session.");
  return window.damiDesktop.saveFile({ content, suggestedName });
}

export async function copyWithDesktopFallback(text: string): Promise<void> {
  if (window.damiDesktop) {
    await window.damiDesktop.writeClipboard(text);
    return;
  }

  if (!navigator.clipboard) throw new Error("Clipboard access is unavailable.");
  await navigator.clipboard.writeText(text);
}

export async function sendDesktopNotification(title: string, body: string): Promise<boolean> {
  if (!window.damiDesktop) return false;
  return window.damiDesktop.notify({ title, body });
}

export async function openTrustedExternalUrl(url: string): Promise<void> {
  if (window.damiDesktop) {
    await window.damiDesktop.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
