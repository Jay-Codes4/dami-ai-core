/**
 * Dami AI — shared domain models.
 *
 * These interfaces are the contract between the browser, the server functions
 * and (later) a Postgres/pgvector backend. Keep them storage-agnostic: the
 * localStorage adapter in `src/lib/storage.ts` and any future database layer
 * must both satisfy these shapes.
 */

import type { DamiLanguageCode } from "./languages";

export type ISODateString = string;

export type VoiceStage =
  | "idle"
  | "welcome"
  | "requesting-permission"
  | "listening"
  | "transcribing"
  | "researching"
  | "answered"
  | "speaking"
  | "error";

export type DamiState =
  | "idle"
  | "welcome"
  | "listening"
  | "thinking"
  | "speaking"
  | "success"
  | "error";

export interface User {
  id: string;
  displayName: string;
  locale: string;
  createdAt: ISODateString;
}

export interface Conversation {
  id: string;
  userId: string | null;
  title: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "dami";
  text: string;
  createdAt: ISODateString;
}

export interface Transcript {
  id: string;
  conversationId: string;
  partialText: string;
  finalText: string;
  durationMs: number;
  engine: "sahara-stt" | "browser-speech" | "typed";
  createdAt: ISODateString;
}

export type LegalDocumentType =
  | "constitution"
  | "legislation"
  | "case-law"
  | "regulation"
  | "public-service-guidance";

export interface LegalSource {
  id: string;
  title: string;
  authority: string;
  jurisdiction: string;
  docType: LegalDocumentType;
  year: number | null;
  locator: string;
  officialSource: string;
  url: string;
  topics: string[];
  summary: string;
  passage?: string;
}

export interface RetrievedPassage {
  source: LegalSource;
  score: number;
  matchedTerms: string[];
}

export interface Citation {
  sourceId: string;
  title: string;
  authority: string;
  locator: string;
  date: string | null;
  url: string;
  officialSource: string;
  passage?: string;
}

export interface ResearchAnswer {
  answer: string;
  keyFindings: string[];
  citations: Citation[];
  insufficientEvidence: boolean;
  limitations: string;
}

export interface ResearchSession {
  id: string;
  conversationId: string | null;
  question: string;
  answer: ResearchAnswer;
  createdAt: ISODateString;
  saved: boolean;
}

export type SavedDocumentKind = "research-note" | "legal-memo" | "summary";

export interface SavedDocument {
  id: string;
  kind: SavedDocumentKind;
  title: string;
  body: string;
  sessionId: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface DamiSettings {
  theme: "light" | "dark" | "system";
  speechLanguage: DamiLanguageCode;
  voiceAccent: string;
  voiceGender: "female" | "male";
  speakAnswers: boolean;
  maxRecordingSeconds: number;
  codeSwitching: boolean;
  desktopDock: "top" | "bottom";
  wakeWordEnabled: boolean;
  floatingAvatarEnabled: boolean;
  launchAtStartup: boolean;
}

export const DEFAULT_SETTINGS: DamiSettings = {
  theme: "system",
  speechLanguage: "en",
  voiceAccent: "yoruba",
  voiceGender: "female",
  speakAnswers: true,
  maxRecordingSeconds: 120,
  codeSwitching: true,
  desktopDock: "top",
  wakeWordEnabled: true,
  floatingAvatarEnabled: true,
  launchAtStartup: true,
};
