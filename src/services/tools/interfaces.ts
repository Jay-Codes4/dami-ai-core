/**
 * Capability interfaces for Dami's future tool surface.
 *
 * The web build ships a registry where every capability reports itself as
 * unavailable. The Electron desktop build will register real, permission-
 * scoped implementations. Nothing here fakes a result: an unregistered tool
 * throws `ToolUnavailableError` so the UI can say so honestly.
 *
 * Dami is never designed for unrestricted computer control — every capability
 * is explicit, named and individually grantable.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface DamiTools {
  web_search(query: string): Promise<WebSearchResult[]>;
  web_open(url: string): Promise<void>;
  web_read(url: string): Promise<string>;
  file_read(path: string): Promise<string>;
  file_save(path: string, contents: string): Promise<void>;
  clipboard(text: string): Promise<void>;
  notifications(title: string, body: string): Promise<void>;
}

export type ToolName = keyof DamiTools;

export class ToolUnavailableError extends Error {
  constructor(public tool: ToolName) {
    super(`The "${tool}" capability isn't available in this build of Dami yet.`);
    this.name = "ToolUnavailableError";
  }
}

type Registry = Partial<DamiTools>;

const registry: Registry = {};

export function registerTool<K extends ToolName>(name: K, impl: DamiTools[K]): void {
  registry[name] = impl;
}

export function isToolAvailable(name: ToolName): boolean {
  return typeof registry[name] === "function";
}

export function availableTools(): ToolName[] {
  return (Object.keys(registry) as ToolName[]).filter(isToolAvailable);
}

export function getTool<K extends ToolName>(name: K): DamiTools[K] {
  const impl = registry[name];
  if (!impl) throw new ToolUnavailableError(name);
  return impl as DamiTools[K];
}

export const ALL_TOOLS: ToolName[] = [
  "web_search",
  "web_open",
  "web_read",
  "file_read",
  "file_save",
  "clipboard",
  "notifications",
];

/**
 * Browser-safe capabilities. Clipboard is genuinely available in the web build,
 * and notifications are registered only when the user has granted permission.
 */
export function registerBrowserTools(): void {
  if (typeof window === "undefined") return;

  if (navigator.clipboard) {
    registerTool("clipboard", async (text: string) => {
      await navigator.clipboard.writeText(text);
    });
  }

  registerTool("web_open", async (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  });

  if ("Notification" in window && Notification.permission === "granted") {
    registerTool("notifications", async (title: string, body: string) => {
      new Notification(title, { body });
    });
  }
}
