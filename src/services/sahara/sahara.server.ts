/**
 * Intron Sahara integration — SERVER ONLY.
 */

export const SAHARA_STT_SYNC_URL =
  process.env["SAHARA_STT_SYNC_URL"] ?? "https://infer.voice.intron.io/file/v1/upload/sync";
export const SAHARA_TTS_GENERATE_URL =
  process.env["SAHARA_TTS_GENERATE_URL"] ?? "https://infer.voice.intron.io/tts/v1/generate";

export class SaharaNotConfiguredError extends Error {
  constructor() {
    super("Sahara isn't connected yet. Add INTRON_API_KEY on the server to enable speech-to-text and text-to-speech.");
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
  return new Uint8Array(Buffer.from(value, "base64"));
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

type SaharaSttPayload = {
  data?: { file_id?: string; audio_transcript?: string; transcript?: string };
  message?: string;
  error?: string;
  detail?: string;
};

async function sendSttRequest(
  wav: Uint8Array,
  language: string,
  key: string,
): Promise<{ response: Response; payload: SaharaSttPayload | null; raw: string }> {
  const fileName = `dami-${Date.now()}.wav`;
  const form = new FormData();
  form.set("audio_file_name", fileName);
  form.set("audio_file_blob", new Blob([wav], { type: "audio/wav" }), fileName);
  form.set("use_category", "file_category_legal");
  form.set("use_language_asr_input", language || "en");
  // Dami's own legal agent performs the downstream reasoning, so Sahara does not
  // need the extra transcript LLM correction pass. This keeps voice turns faster.
  form.set("use_disable_llm_corrections", "TRUE");

  const response = await fetch(SAHARA_STT_SYNC_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  const raw = await response.text();
  let payload: SaharaSttPayload | null = null;
  try { payload = raw ? (JSON.parse(raw) as SaharaSttPayload) : null; } catch { payload = null; }
  return { response, payload, raw };
}

export async function transcribe(request: SttRequest): Promise<SttResult> {
  const started = Date.now();
  const key = getSaharaKey();
  const pcm = decodeBase64(request.audioBase64);
  if (pcm.byteLength < 3200) {
    throw new SaharaRequestError("Dami didn't receive enough audio to transcribe. Please speak for at least a moment and try again.");
  }
  const wav = pcm16ToWav(pcm, request.sampleRate);

  let attempt = await sendSttRequest(wav, request.language || "en", key);
  if (!attempt.response.ok && request.language && request.language !== "en" && attempt.response.status === 400) {
    attempt = await sendSttRequest(wav, "en", key);
  }

  if (!attempt.response.ok) {
    const upstream = attempt.payload?.message ?? attempt.payload?.error ?? attempt.payload?.detail ?? attempt.raw.slice(0, 220);
    console.error("Sahara STT upstream rejected recording", { status: attempt.response.status, upstream });
    const message = upstream ||
      (attempt.response.status === 401 || attempt.response.status === 403
        ? "Sahara couldn't authenticate the speech request. Check the production INTRON_API_KEY."
        : attempt.response.status === 429
          ? "Sahara is receiving too many speech requests right now. Please try again in a moment."
          : `Sahara could not transcribe that recording (HTTP ${attempt.response.status}).`);
    throw new SaharaRequestError(message);
  }

  const text = attempt.payload?.data?.audio_transcript ?? attempt.payload?.data?.transcript ?? "";
  return { text: text.trim(), requestId: attempt.payload?.data?.file_id ?? null, durationMs: Date.now() - started };
}

export interface TtsRequest {
  text: string;
  accent: string;
  gender: string;
  language: string;
}

export async function synthesize(request: TtsRequest): Promise<{ audio: Uint8Array; mime: string }> {
  const key = getSaharaKey();
  const response = await fetch(SAHARA_TTS_GENERATE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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
