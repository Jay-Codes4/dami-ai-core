/**
 * Browser side of the speech pipeline.
 * Captures microphone audio, converts it to 16 kHz mono PCM16 and sends it to
 * Dami's server route. Credentials remain server-side.
 */

export const TARGET_SAMPLE_RATE = 16000;

export class MicrophoneError extends Error {
  constructor(message: string, public reason: "denied" | "unavailable" | "empty") {
    super(message);
    this.name = "MicrophoneError";
  }
}

export interface Recorder {
  stop(): Promise<Float32Array>;
  cancel(): void;
  level(): number;
}

export async function startRecording(maxSeconds: number): Promise<Recorder> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneError("This device can't reach a microphone. You can still type your question to Dami.", "unavailable");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    const name = (error as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new MicrophoneError("Dami needs microphone access to listen. Allow microphone access, then try again.", "denied");
    }
    throw new MicrophoneError("Dami couldn't open your microphone. Check that it is connected and not being used exclusively by another app.", "unavailable");
  }

  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioCtx();
  if (context.state === "suspended") await context.resume();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silentGain = context.createGain();
  silentGain.gain.value = 0;

  const buffers: Float32Array[] = [];
  let peak = 0;
  let stopped = false;

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer.getChannelData(0);
    buffers.push(new Float32Array(input));
    let localPeak = 0;
    for (let i = 0; i < input.length; i += 16) localPeak = Math.max(localPeak, Math.abs(input[i]!));
    peak = peak * 0.7 + localPeak * 0.3;
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  const teardown = () => {
    if (stopped) return;
    stopped = true;
    processor.disconnect();
    silentGain.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
  };

  const autoStop = setTimeout(teardown, maxSeconds * 1000);

  return {
    async stop() {
      clearTimeout(autoStop);
      const sampleRate = context.sampleRate;
      teardown();
      const merged = concat(buffers);
      void context.close();
      if (merged.length === 0) throw new MicrophoneError("Dami didn't receive any microphone audio. Try again.", "empty");
      return resample(merged, sampleRate, TARGET_SAMPLE_RATE);
    },
    cancel() {
      clearTimeout(autoStop);
      teardown();
      void context.close();
      buffers.length = 0;
    },
    level: () => Math.min(1, peak * 3),
  };
}

function concat(buffers: Float32Array[]): Float32Array {
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const b of buffers) { out.set(b, offset); offset += b.length; }
  return out;
}

export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const low = Math.floor(position);
    const high = Math.min(low + 1, input.length - 1);
    const weight = position - low;
    out[i] = input[low]! * (1 - weight) + input[high]! * weight;
  }
  return out;
}

export function floatToPcm16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

export interface TranscriptionResult { text: string; durationMs: number; requestId: string | null; }

export async function transcribeSamples(samples: Float32Array, options: { language: string; codeSwitching: boolean }): Promise<TranscriptionResult> {
  let response: Response;
  try {
    response = await fetch("/api/sahara/stt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64: floatToPcm16Base64(samples),
        sampleRate: TARGET_SAMPLE_RATE,
        language: options.language,
        codeSwitching: options.codeSwitching,
      }),
    });
  } catch (error) {
    console.error("Dami STT network failure", error);
    throw new Error("Dami couldn't reach the speech server. Check your internet connection and try again.");
  }

  const raw = await response.text();
  let payload: ({ error?: string; code?: string } & Partial<TranscriptionResult>) | null = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }

  if (!response.ok) {
    console.error("Dami STT request failed", { status: response.status, contentType: response.headers.get("content-type"), body: raw.slice(0, 500) });
    const serverMessage = payload?.error?.trim();
    throw new Error(serverMessage || `Speech transcription failed (HTTP ${response.status}). Please try again.`);
  }

  if (!payload?.text?.trim()) {
    console.error("Dami STT returned no transcript", { status: response.status, body: raw.slice(0, 500) });
    throw new Error("Dami received the recording but no speech was detected. Speak clearly for a few seconds and try again.");
  }

  return {
    text: payload.text.trim(),
    durationMs: payload.durationMs ?? 0,
    requestId: payload.requestId ?? null,
  };
}
