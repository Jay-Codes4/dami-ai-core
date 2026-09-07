/**
 * Dami AI — shared domain models.
 *
 * These interfaces are the contract between the browser, the server functions
 * and (later) a Postgres/pgvector backend. Keep them storage-agnostic: the
 * localStorage adapter in `src/lib/storage.ts` and any future database layer
 * must both satisfy these shapes.
 */

export type ISODateString = string;

/** Lifecycle of a single voice interaction. */
export type VoiceStage =
  | "idle"
  | "requesting-permission"
  | "listening"
  | "transcribing"
  | "researching"
  | "answered"
  | "speaking"
  | "error";

/** Visual/behavioural states of the Dami character. */
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
  /** Kept deliberately minimal — Dami stores no unnecessary personal data. */
  locale: "en-GH" | "en";
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
  /** Live, non-authoritative text streamed while the user speaks. */
  partialText: string;
  /** Committed text — the only transcript used for legal processing. */
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

/**
 * A verified, citation-level record of a real legal source.
 * `summary` is an editorial description written for retrieval — it is never
 * presented as a quotation. Quoted text may only ever come from ingested
 * source documents, never from a language model.
 */
export interface LegalSource {
  id: string;
  title: string;
  /** Issuing authority, e.g. "Parliament of Ghana", "Supreme Court of Ghana". */
  authority: string;
  jurisdiction: "Ghana";
  docType: LegalDocumentType;
  /** Year of enactment / decision, when known. */
  year: number | null;
  /** Citation locator, e.g. "Act 30", "Article 14", "s. 96". */
  locator: string;
  /** Official or authoritative repository that hosts the full text. */
  officialSource: string;
  /** Clickable link to that repository. Never fabricate deep links. */
  url: string;
  topics: string[];
  summary: string;
  /** Optional verbatim passage — only present when ingested from source text. */
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
  /** Verbatim passage, present only when the corpus record carries one. */
  passage?: string;
}

export interface ResearchAnswer {
  /** Plain-language answer, grounded strictly in the retrieved sources. */
  answer: string;
  keyFindings: string[];
  /** Authorities the answer actually relies on. */
  citations: Citation[];
  /** True when the corpus lacks adequate authority for the question. */
  insufficientEvidence: boolean;
  /** Explanation shown when evidence is insufficient. */
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
  /** Sahara TTS voice preferences (sent server-side only). */
  voiceAccent: "ghanaian" | "west-african" | "neutral";
  voiceGender: "female" | "male";
  speakAnswers: boolean;
  maxRecordingSeconds: number;
  /** Allow Akan-English code-switching hints for STT. */
  codeSwitching: boolean;
}

export const DEFAULT_SETTINGS: DamiSettings = {
  theme: "system",
  voiceAccent: "ghanaian",
  voiceGender: "female",
  speakAnswers: true,
  maxRecordingSeconds: 120,
  codeSwitching: true,
};
