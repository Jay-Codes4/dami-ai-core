import { createClientOnlyFn } from "@tanstack/react-start";

export interface AudioCapture {
  blob: Blob;
  mimeType: string;
  extension: string;
  durationMs: number;
}

export interface Recorder {
  stop(): Promise<AudioCapture>;
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
  started: Promise<void>;
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
    capture: AudioCapture,
    options: { language: string; codeSwitching: boolean; browserTranscript?: string },
  ): Promise<TranscriptionResult> => {
    const mod = await import("./stt.client");
    return mod.transcribeSamples(capture, options);
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
