import { createClientOnlyFn } from "@tanstack/react-start";

export interface Recorder {
  stop(): Promise<Float32Array>;
  cancel(): void;
  level(): number;
}

export interface TranscriptionResult {
  text: string;
  durationMs: number;
  requestId: string | null;
}

export interface SpeechHandle {
  stop(): void;
  ended: Promise<void>;
}

export const prepareAudioPlayback = createClientOnlyFn(async (): Promise<void> => {
  const mod = await import("./tts.client");
  await mod.prepareAudioPlayback();
});

export const startRecording = createClientOnlyFn(
  async (maxSeconds: number): Promise<Recorder> => {
    // This runs directly from the user's Talk with Dami click. Unlock WebAudio
    // here so the female Sahara response can play after STT + research finish.
    const tts = await import("./tts.client");
    await tts.prepareAudioPlayback().catch(() => undefined);
    const mod = await import("./stt.client");
    return mod.startRecording(maxSeconds);
  },
);

export const transcribeSamples = createClientOnlyFn(
  async (
    samples: Float32Array,
    options: { language: string; codeSwitching: boolean },
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
