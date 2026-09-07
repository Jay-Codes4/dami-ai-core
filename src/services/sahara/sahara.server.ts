/**
 * Intron Sahara integration — SERVER ONLY.
 *
 * The Sahara credential never leaves the server. For the deadline build we use
 * Sahara's synchronous file STT and TTS generate endpoints. This avoids
 * exposing credentials in browser WebSockets and runs cleanly in Vercel's
 * Node/server-function environment. The client can still present a streaming-
 * style voice UX while the server owns the authenticated request.
 */

export const SAHARA_STT_SYNC_URL =
  process.env["SAHARA_STT_SYNC_URL"] ?? "https://infer.voice.intron.io/file/v1/upload/sync";
export const SAHARA_TTS_GENERATE_URL =
  process.env["SAHARA_TTS_GENERATE_URL"] ?? "https://infer.voice.intron.io/tts/v1/generate";

export class SaharaNotConfiguredError extends Error {
  constructor() {
    super(
      "Sahara isn't connected yet. Add INTRON_API_KEY on the server to enable speech-to-text and text-to-speech.",
    );
    this.name = "SaharaNotConfiguredError";
  }
}

export class SaharaRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaharaRequestError";
  }
}

export function getSaharaKey(): string {
  const key = process.env["INTRON_API_KEY"];
  if (!key) throw new SaharaNotConfiguredError();
  return key;
}

export function isSaharaConfigured(): boolean {
  return Boolean(process.env["INTRON_API_KEY"]);
}

export interface SttRequest {
  /** Base64-encoded mono PCM16 audio. */
  audioBase64: string;
  sampleRate: number;
  language: string;
  codeSwitching: boolean;
}

export interface SttResult {
  text: string;
  requestId: string | null;
  durationMs: number;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);

  const wav = new Uint8Array(44 + pcm.byteLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  return wav;
}

/** Transcribe one browser recording with Sahara's documented synchronous STT endpoint. */
export async function transcribe(request: SttRequest): Promise<SttResult> {
  const started = Date.now();
  const key = getSaharaKey();
  const pcm = decodeBase64(request.audioBase64);
  const wav = pcm16ToWav(pcm, request.sampleRate);

  const form = new FormData();
  form.set("audio_file_name", `dami-${Date.now()}.wav`);
  form.set("audio_file_blob", new Blob([wav], { type: "audio/wav" }), `dami-${Date.now()}.wav`);
  form.set("use_category", "file_category_legal");
  form.set("use_language_asr_input", request.language || "en");
  form.set("use_disable_llm_corrections", "FALSE");

  const response = await fetch(SAHARA_STT_SYNC_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        data?: {
          file_id?: string;
          audio_transcript?: string;
          transcript?: string;
        };
        message?: string;
      }
    | null;

  if (!response.ok) {
    const message = payload?.message ?? "Sahara could not transcribe that recording.";
    throw new SaharaRequestError(message);
  }

  const text = payload?.data?.audio_transcript ?? payload?.data?.transcript ?? "";
  return {
    text: text.trim(),
    requestId: payload?.data?.file_id ?? null,
    durationMs: Date.now() - started,
  };
}

export interface TtsRequest {
  text: string;
  accent: string;
  gender: string;
  language: string;
}

/** Generate natural African-accented speech with Sahara's synchronous TTS endpoint. */
export async function synthesize(request: TtsRequest): Promise<{ audio: Uint8Array; mime: string }> {
  const key = getSaharaKey();
  const response = await fetch(SAHARA_TTS_GENERATE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: request.text.slice(0, 4096),
      voice_accent: request.accent,
      voice_gender: request.gender,
      voice_language: request.language || "en",
      output_audio_format: "wav",
    }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new SaharaRequestError(detail?.message ?? "Sahara could not generate speech for that answer.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) throw new SaharaRequestError("Sahara returned no audio for this answer.");
  return { audio: bytes, mime: response.headers.get("content-type") ?? "audio/wav" };
}
