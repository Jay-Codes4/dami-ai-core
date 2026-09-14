import type { DamiLanguage } from "./languages";
import type { TranscriptEngine, VoiceTranscript } from "./types";

export const MAX_LEGAL_QUERY_CHARACTERS = 8000;

export function normalizeRetrievalQuery(originalTranscript: string) {
  return originalTranscript
    .normalize("NFKC")
    .replace(/^\s*(?:(?:hey|hi|okay|ok)\s+)?(?:dami|dummy|demi|dammy|darmi)\b[,.:;\s-]*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildVoiceTranscript(
  originalTranscript: string,
  engine: TranscriptEngine,
  language: DamiLanguage,
  transcriptionLatencyMs = 0,
  requestId: string | null = null,
): VoiceTranscript {
  const original = originalTranscript.trim();
  return {
    originalTranscript: original,
    normalizedRetrievalQuery: normalizeRetrievalQuery(original) || original,
    engine,
    selectedLanguage: language.code,
    expectedLanguages: [...language.expectedLanguages],
    codeSwitchedMode: language.codeSwitched,
    transcriptionLatencyMs,
    requestId,
  };
}
