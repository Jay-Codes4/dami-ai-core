const ENABLED =
  import.meta.env.DEV ||
  (import.meta.env["VITE_DAMI_VOICE_DIAGNOSTICS"] as string | undefined) === "true";

/** Metadata-only diagnostics: never pass transcript, answer, audio, or credentials. */
export function voiceDiagnostic(event: string, details: Record<string, string | number | boolean>) {
  if (!ENABLED) return;
  console.info(`[DAMI VOICE] ${event}`, details);
}
