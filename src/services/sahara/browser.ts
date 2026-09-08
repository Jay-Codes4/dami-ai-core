import { createClientOnlyFn } from "@tanstack/react-start";

export interface Recorder {
  stop(): Promise<Float32Array>;
  cancel(): void;
  level(): number;
  transcript(): string;
}

export interface TranscriptionResult {
  text: string;
  durationMs: number;
  requestId: string | null;
}

export interface SpeechHandle {
  stop(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  ended: Promise<void>;
}

export const prepareAudioPlayback = createClientOnlyFn(async (): Promise<void> => {
  const mod = await import("./tts.client");
  await mod.prepareAudioPlayback();
});

export const startRecording = createClientOnlyFn(
  async (maxSeconds: number, language = "en-NG"): Promise<Recorder> => {
    const tts = await import("./tts.client");
    await tts.prepareAudioPlayback().catch(() => undefined);
    const mod = await import("./stt.client");
    return mod.startRecording(maxSeconds, language);
  },
);

export const transcribeSamples = createClientOnlyFn(
  async (
    samples: Float32Array,
    options: { language: string; codeSwitching: boolean; browserTranscript?: string },
  ): Promise<TranscriptionResult> => {
    const mod = await import("./stt.client");
    return mod.transcribeSamples(samples, options);
  },
);

export const speak = createClientOnlyFn(
  async (
    text: string,
    options: { accent: string; gender: string; language: string },
  ): Promise<SpeechHandle> => {
    const mod = await import("./tts.client");
    return mod.speak(text, options);
  },
);
