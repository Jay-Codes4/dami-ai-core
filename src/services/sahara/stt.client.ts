/**
 * Browser side of the speech pipeline.
 *
 * Captures microphone audio, converts it to 16 kHz mono PCM16 (the encoding
 * Sahara's streaming STT expects) and posts it to the server route, which owns
 * the credential. No key, endpoint or model name is exposed here.
 */

export const TARGET_SAMPLE_RATE = 16000;

export class MicrophoneError extends Error {
  constructor(
    message: string,
    public reason: "denied" | "unavailable" | "empty",
  ) {
    super(message);
    this.name = "MicrophoneError";
  }
}

export interface Recorder {
  stop(): Promise<Float32Array>;
  cancel(): void;
  /** Rolling input level 0–1, for the listening visualisation. */
  level(): number;
}

export async function startRecording(maxSeconds: number): Promise<Recorder> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneError(
      "This browser can't reach a microphone. You can still type your question to Dami.",
      "unavailable",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    const name = (error as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new MicrophoneError(
        "Dami needs microphone access to listen. Allow it in your browser, then try again.",
        "denied",
      );
    }
    throw new MicrophoneError(
      "Dami couldn't open a microphone. Check that one is connected and free.",
      "unavailable",
    );
  }

  const AudioCtx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioCtx();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);

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
  processor.connect(context.destination);

  const teardown = () => {
    stopped = true;
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };

  const autoStop = setTimeout(() => {
    if (!stopped) teardown();
  }, maxSeconds * 1000);

  return {
    async stop() {
      clearTimeout(autoStop);
      const sampleRate = context.sampleRate;
      teardown();
      const merged = concat(buffers);
      if (merged.length === 0) {
        throw new MicrophoneError("Dami didn't hear anything. Try recording again.", "empty");
      }
      return resample(merged, sampleRate, TARGET_SAMPLE_RATE);
    },
    cancel() {
      clearTimeout(autoStop);
      teardown();
      buffers.length = 0;
    },
    level: () => Math.min(1, peak * 3),
  };
}

function concat(buffers: Float32Array[]): Float32Array {
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }
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
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface TranscriptionResult {
  text: string;
  durationMs: number;
  requestId: string | null;
}

export async function transcribeSamples(
  samples: Float32Array,
  options: { language: string; codeSwitching: boolean },
): Promise<TranscriptionResult> {
  const response = await fetch("/api/sahara/stt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64: floatToPcm16Base64(samples),
      sampleRate: TARGET_SAMPLE_RATE,
      language: options.language,
      codeSwitching: options.codeSwitching,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string } & TranscriptionResult;
  if (!response.ok) {
    throw new Error(payload.error ?? "Dami couldn't turn that recording into text.");
  }
  return payload;
}
