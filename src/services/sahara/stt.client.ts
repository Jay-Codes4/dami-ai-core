/** Browser microphone capture with live interim transcript + compact MediaRecorder audio for Sahara. */
export class MicrophoneError extends Error {
  constructor(message: string, public reason: "denied" | "unavailable" | "empty") {
    super(message);
    this.name = "MicrophoneError";
  }
}

type RecognitionResultLike = { isFinal: boolean; 0?: { transcript?: string } };
type RecognitionEventLike = { resultIndex: number; results: ArrayLike<RecognitionResultLike> };
type RecognitionErrorLike = { error?: string };
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => RecognitionLike;

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

function startLiveRecognition(language: string) {
  const w = window as typeof window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  // Chrome's web recognizer is much more dependable with a broadly-supported
  // locale. Sahara still receives the user's selected African language separately.
  recognition.lang = language === "en-NG" || language === "en" ? "en-US" : language;

  let finalText = "";
  let interim = "";
  let wanted = true;
  let active = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const start = () => {
    if (!wanted) return;
    try {
      recognition.start();
      active = true;
    } catch {
      restartTimer = setTimeout(start, 300);
    }
  };

  recognition.onresult = (event) => {
    interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result?.[0]?.transcript?.trim() ?? "";
      if (!text) continue;
      if (result.isFinal) finalText = `${finalText} ${text}`.trim();
      else interim = `${interim} ${text}`.trim();
    }
  };

  recognition.onerror = (event) => {
    const code = event?.error ?? "";
    if (code === "language-not-supported" || code === "bad-grammar") recognition.lang = "en-US";
    if (code === "not-allowed" || code === "service-not-allowed") wanted = false;
  };

  recognition.onend = () => {
    active = false;
    if (wanted) restartTimer = setTimeout(start, 220);
  };

  start();
  return {
    get: () => `${finalText} ${interim}`.trim(),
    stop: () => {
      wanted = false;
      if (restartTimer) clearTimeout(restartTimer);
      if (active) try { recognition.stop(); } catch { /* ignore */ }
    },
    abort: () => {
      wanted = false;
      if (restartTimer) clearTimeout(restartTimer);
      try { recognition.abort(); } catch { /* ignore */ }
    },
  };
}

function chooseMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
  return candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "";
}

function extensionFor(mimeType: string) {
  return mimeType.includes("ogg") ? "ogg" : "webm";
}

export async function startRecording(maxSeconds: number, language = "en-NG"): Promise<Recorder> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new MicrophoneError("This browser can't use Dami's live microphone mode. You can still type your question.", "unavailable");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    const name = (error as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new MicrophoneError("Dami needs microphone access to listen. Allow microphone access, then try again.", "denied");
    }
    throw new MicrophoneError("Dami couldn't open your microphone. Check that it is connected and free.", "unavailable");
  }

  const recognition = startLiveRecognition(language);
  const mimeType = chooseMimeType();
  const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let stopped = false;
  let cancelled = false;

  // Analyser gives us the voice meter and end-of-speech detection without the old
  // ScriptProcessor pipeline that duplicated every PCM sample in memory.
  const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const context = AudioCtx ? new AudioCtx() : null;
  if (context?.state === "suspended") await context.resume();
  const source = context?.createMediaStreamSource(stream) ?? null;
  const analyser = context?.createAnalyser() ?? null;
  if (source && analyser) {
    analyser.fftSize = 512;
    source.connect(analyser);
  }
  const meter = analyser ? new Float32Array(analyser.fftSize) : null;

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (!cancelled && event.data.size) chunks.push(event.data);
  });
  mediaRecorder.start(200);

  const teardownTracks = () => {
    stream.getTracks().forEach((track) => track.stop());
    source?.disconnect();
    recognition?.stop();
    void context?.close();
  };

  const autoStop = setTimeout(() => {
    if (!stopped && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  }, maxSeconds * 1000);

  return {
    stop() {
      clearTimeout(autoStop);
      if (stopped) return Promise.reject(new MicrophoneError("That recording has already ended.", "empty"));
      stopped = true;
      return new Promise<AudioCapture>((resolve, reject) => {
        mediaRecorder.addEventListener("stop", () => {
          teardownTracks();
          const type = mediaRecorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(chunks, { type });
          if (!blob.size) {
            reject(new MicrophoneError("Dami didn't receive any microphone audio. Try again.", "empty"));
            return;
          }
          resolve({ blob, mimeType: type, extension: extensionFor(type), durationMs: Date.now() - startedAt });
        }, { once: true });
        if (mediaRecorder.state === "inactive") {
          // The max-duration timer may already have stopped it.
          teardownTracks();
          const type = mediaRecorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(chunks, { type });
          if (!blob.size) reject(new MicrophoneError("Dami didn't receive any microphone audio. Try again.", "empty"));
          else resolve({ blob, mimeType: type, extension: extensionFor(type), durationMs: Date.now() - startedAt });
        } else {
          mediaRecorder.stop();
        }
      });
    },
    cancel() {
      clearTimeout(autoStop);
      cancelled = true;
      stopped = true;
      recognition?.abort();
      if (mediaRecorder.state !== "inactive") try { mediaRecorder.stop(); } catch { /* ignore */ }
      chunks.length = 0;
      teardownTracks();
    },
    level() {
      if (!analyser || !meter) return 0;
      analyser.getFloatTimeDomainData(meter);
      let peak = 0;
      for (let i = 0; i < meter.length; i += 4) peak = Math.max(peak, Math.abs(meter[i] ?? 0));
      return Math.min(1, peak * 3);
    },
    transcript: () => recognition?.get() ?? "",
  };
}

async function saharaFinal(capture: AudioCapture, options: { language: string; codeSwitching: boolean }) {
  const form = new FormData();
  form.set("audio", capture.blob, `dami.${capture.extension}`);
  form.set("language", options.language || "en");
  form.set("codeSwitching", String(options.codeSwitching));
  form.set("durationMs", String(capture.durationMs));

  const response = await fetch("/api/sahara-stt", { method: "POST", body: form });
  const raw = await response.text();
  let payload: ({ error?: string } & Partial<TranscriptionResult>) | null = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  if (response.ok && payload?.text?.trim()) {
    return { text: payload.text.trim(), durationMs: payload.durationMs ?? 0, requestId: payload.requestId ?? null };
  }
  throw new Error(payload?.error?.trim() || `Speech transcription failed (HTTP ${response.status}). Please try again.`);
}

export async function transcribeSamples(
  capture: AudioCapture,
  options: { language: string; codeSwitching: boolean; browserTranscript?: string },
): Promise<TranscriptionResult> {
  const fallback = options.browserTranscript?.trim() ?? "";
  const sahara = saharaFinal(capture, options);

  // The live transcript drives the interface immediately. Sahara still receives
  // the complete audio turn and wins whenever it returns quickly enough.
  if (fallback) {
    const immediate = new Promise<TranscriptionResult>((resolve) =>
      setTimeout(() => resolve({ text: fallback, durationMs: 0, requestId: null }), 650),
    );
    try { return await Promise.race([sahara, immediate]); }
    catch { return { text: fallback, durationMs: 0, requestId: null }; }
  }

  const timeout = new Promise<TranscriptionResult>((_, reject) =>
    setTimeout(() => reject(new Error("Dami didn't get a live transcript and Sahara is still processing. Please try once more.")), 6500),
  );
  return Promise.race([sahara, timeout]);
}
