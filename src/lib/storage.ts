/**
 * Storage layer.
 *
 * `DamiStorage` is the single seam between the app and persistence. The
 * browser build uses a localStorage adapter; the Electron/desktop and hosted
 * builds can swap in a Postgres-backed adapter without touching UI code.
 */

import type { DamiSettings, ResearchSession, SavedDocument } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export interface DamiStorage {
  listSessions(): ResearchSession[];
  saveSession(session: ResearchSession): void;
  deleteSession(id: string): void;
  listDocuments(): SavedDocument[];
  saveDocument(doc: SavedDocument): void;
  deleteDocument(id: string): void;
  getSettings(): DamiSettings;
  setSettings(settings: DamiSettings): void;
}

const KEYS = {
  sessions: "dami.sessions.v1",
  documents: "dami.documents.v1",
  settings: "dami.settings.v1",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("dami:storage", { detail: key }));
  } catch {
    /* quota or private-mode failures are non-fatal */
  }
}

export const localStorageAdapter: DamiStorage = {
  listSessions: () =>
    read<ResearchSession[]>(KEYS.sessions, []).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  saveSession(session) {
    const all = read<ResearchSession[]>(KEYS.sessions, []).filter((s) => s.id !== session.id);
    write(KEYS.sessions, [session, ...all].slice(0, 200));
  },
  deleteSession(id) {
    write(
      KEYS.sessions,
      read<ResearchSession[]>(KEYS.sessions, []).filter((s) => s.id !== id),
    );
  },
  listDocuments: () =>
    read<SavedDocument[]>(KEYS.documents, []).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
  saveDocument(doc) {
    const all = read<SavedDocument[]>(KEYS.documents, []).filter((d) => d.id !== doc.id);
    write(KEYS.documents, [doc, ...all].slice(0, 200));
  },
  deleteDocument(id) {
    write(
      KEYS.documents,
      read<SavedDocument[]>(KEYS.documents, []).filter((d) => d.id !== id),
    );
  },
  getSettings: () => ({ ...DEFAULT_SETTINGS, ...read<Partial<DamiSettings>>(KEYS.settings, {}) }),
  setSettings: (settings) => write(KEYS.settings, settings),
};

export const storage: DamiStorage = localStorageAdapter;

export const STORAGE_EVENT = "dami:storage";

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}
