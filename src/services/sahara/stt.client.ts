/** Browser microphone capture streamed to Sahara through Dami's authenticated gateway. */
export class MicrophoneError extends Error {
  constructor(
    message: string,
    public reason: "denied" | "unavailable" | "empty",
  ) {
    super(message);
    this.name = "MicrophoneError";
  }
}

export interface AudioCapture {
  blob: Blob;
  mimeType: string;
  extension: string;
  durationMs: number;
  transcript?: string;
  partialTranscript?: string;
  browserTranscript?: string;
  streamed?: boolean;
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
  engine: "sahara-stt" | "groq-whisper-large-v3" | "windows-speech" | "browser-speech";
  language: string;
}

const VOICE_WS_URL =
  (import.meta.env["VITE_DAMI_VOICE_WS_URL"] as string | undefined) ||
  "wss://dami-ai-core-1.onrender.com/stt";
const VOICE_HEALTH_URL = VOICE_WS_URL.replace(/^wss:/, "https:")
  .replace(/^ws:/, "http:")
  .replace(/\/stt(?:\?.*)?$/, "/health");

export async function warmVoiceGateway() {
  try {
    await fetch(VOICE_HEALTH_URL, { cache: "no-store", mode: "no-cors" });
  } catch {
    // This is only an early cold-start hint; startRecording retains full recovery.
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step)
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

function resampleTo16k(input: Float32Array, inputRate: number) {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const length = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio,
      left = Math.floor(pos),
      right = Math.min(input.length - 1, left + 1),
      frac = pos - left;
    out[i] = (input[left] ?? 0) * (1 - frac) + (input[right] ?? 0) * frac;
  }
  return out;
}

function pcm16Bytes(samples: Float32Array) {
  const buffer = new ArrayBuffer(samples.length * 2),
    view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function pcm16Wav(chunks: Uint8Array[]) {
  const pcmLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const buffer = new ArrayBuffer(44 + pcmLength),
    view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcmLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcmLength, true);
  const output = new Uint8Array(buffer, 44);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function startRecording(maxSeconds: number, language = "en"): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof WebSocket === "undefined")
    throw new MicrophoneError(
      "This browser can't use Dami's live microphone mode. You can still type your question.",
      "unavailable",
    );
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (error) {
    const name = (error as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError")
      throw new MicrophoneError(
        "Dami needs microphone access to listen. Allow microphone access, then try again.",
        "denied",
      );
    throw new MicrophoneError(
      "Dami couldn't open your microphone. Check that it is connected and free.",
      "unavailable",
    );
  }

  const AudioCtx =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    stream.getTracks().forEach((t) => t.stop());
    throw new MicrophoneError("Live audio isn't supported in this browser.", "unavailable");
  }
  const context = new AudioCtx();
  if (context.state === "suspended") await context.resume();
  const source = context.createMediaStreamSource(stream),
    analyser = context.createAnalyser(),
    processor = context.createScriptProcessor(2048, 1, 1);
  analyser.fftSize = 512;
  source.connect(analyser);
  source.connect(processor);
  processor.connect(context.destination);
  const meter = new Float32Array(analyser.fftSize),
    startedAt = Date.now();
  let transcript = "",
    committedTranscript = "",
    browserTranscript = "",
    stopped = false,
    cancelled = false,
    ack = 0,
    pending = new Uint8Array(0),
    finalResolve: ((text: string) => void) | null = null;
  const recordedChunks: Uint8Array[] = [];
  let terminalError = "";

  // Keep a local browser recognizer running alongside Sahara. Sahara remains
  // primary, but this gives the web/mobile demo an immediate transcript when
  // the upstream account is out of balance or temporarily unavailable.
  const SpeechRecognitionCtor = (window as typeof window & {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  }).SpeechRecognition ?? (window as typeof window & { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
  let browserRecognizer: any = null;
  if (SpeechRecognitionCtor) {
    try {
      browserRecognizer = new SpeechRecognitionCtor();
      browserRecognizer.continuous = true;
      browserRecognizer.interimResults = true;
      // Browser resilience must stay usable when Sahara is out of balance. Web Speech
      // does not reliably support Igbo/Pidgin locale tags, so code-switch modes
      // use Nigerian English recognition while preserving the selected mode in
      // Dami's transcript/research context.
      browserRecognizer.lang =
        language === "ig" || language === "pcm" || language === "ak" || language === "yo"
          ? "en-NG"
          : language === "sw"
            ? "sw-KE"
            : "en-NG";
      browserRecognizer.onresult = (event: any) => {
        let combined = "";
        for (let i = 0; i < event.results.length; i++)
          combined += `${event.results[i]?.[0]?.transcript ?? ""} `;
        browserTranscript = combined.trim();
      };
      browserRecognizer.onerror = () => {};
      browserRecognizer.start();
    } catch {
      browserRecognizer = null;
    }
  }
  const finalPromise = new Promise<string>((resolve) => {
    finalResolve = resolve;
  });
  const ws = new WebSocket(`${VOICE_WS_URL}?language=${encodeURIComponent(language || "en")}`);

  const sendChunk = (chunk: Uint8Array) => {
    ws.send(
      JSON.stringify({
        message_type: "INPUT_AUDIO_CHUNK",
        audio_base_64: toBase64(chunk),
        ack_id: ++ack,
      }),
    );
  };

  const flushFullChunks = () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    while (pending.length >= 4096) {
      const send = pending.slice(0, 4096);
      pending = pending.slice(4096);
      sendChunk(send);
    }
  };

  const appendAndSend = (chunk: Uint8Array) => {
    recordedChunks.push(chunk);
    const merged = new Uint8Array(pending.length + chunk.length);
    merged.set(pending);
    merged.set(chunk, pending.length);
    pending = merged;
    flushFullChunks();
  };

  processor.onaudioprocess = (event) => {
    if (!stopped && !cancelled)
      appendAndSend(
        pcm16Bytes(resampleTo16k(event.inputBuffer.getChannelData(0), context.sampleRate)),
      );
  };

  ws.onopen = () => flushFullChunks();
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data));
      const type = String(msg.message_type ?? "");
      const text = String(
        type === "COMMITTED_TRANSCRIPT"
          ? (msg.transcript_text ?? msg.transcript ?? msg.text ?? "")
          : (msg.transcript ?? msg.transcript_text ?? msg.text ?? ""),
      ).trim();

      if ((type === "PARTIAL_TRANSCRIPT" || type === "COMMITTED_TRANSCRIPT") && text)
        transcript = text;
      if (type === "COMMITTED_TRANSCRIPT") {
        committedTranscript = transcript;
        finalResolve?.(committedTranscript);
      }

      if (
        [
          "GATEWAY_ERROR",
          "ERROR",
          "INPUT_ERROR",
          "AUTHENTICATION_ERROR",
          "RESOURCE_EXHAUSTED",
          "QUOTA_EXCEEDED",
          "CHUNK_SIZE_TOO_SMALL",
          "CHUNK_SIZE_TOO_LARGE",
          "INSUFFICIENT_AUDIO_ACTIVITY",
          "SESSION_TIME_LIMIT_EXCEEDED",
          "CHUNK_ID_MISMATCH_WITH_TOTAL",
        ].includes(type)
      ) {
        terminalError = String(msg.message ?? type).trim();
        finalResolve?.("");
      }
    } catch {
      /* ignore malformed upstream events */
    }
  };
  ws.onerror = () => {
    terminalError ||= "Voice streaming connection failed.";
    finalResolve?.("");
  };
  ws.onclose = () => {
    if (!stopped && !cancelled) finalResolve?.(committedTranscript);
  };

  const stopBrowserRecognizer = async () => {
    if (!browserRecognizer) return;
    try {
      // Ask recognition to finalize rather than aborting it. Mobile Chrome can
      // deliver the useful final hypothesis only from the result/end events
      // after stop(), so abort() was discarding the quota fallback transcript.
      browserRecognizer.stop();
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        browserRecognizer.addEventListener?.("end", done, { once: true });
        window.setTimeout(resolve, 650);
      });
    } catch {
      // Browser recognition is best-effort resilience only.
    }
  };

  const teardown = () => {
    processor.onaudioprocess = null;
    try {
      processor.disconnect();
      source.disconnect();
      analyser.disconnect();
    } catch {
      // The media tracks are stopped below even if one audio node was already disconnected.
    }
    stream.getTracks().forEach((t) => t.stop());
    void context.close();
  };
  const timer = setTimeout(() => {
    if (!stopped) void finish();
  }, maxSeconds * 1000);

  const waitForSocket = async () => {
    if (ws.readyState === WebSocket.OPEN) return true;
    if (ws.readyState !== WebSocket.CONNECTING) return false;
    return new Promise<boolean>((resolve) => {
      const opened = () => {
        cleanup();
        resolve(true);
      };
      const failed = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        ws.removeEventListener("open", opened);
        ws.removeEventListener("error", failed);
        ws.removeEventListener("close", failed);
        clearTimeout(timeout);
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        resolve(false);
      }, 4000);
      ws.addEventListener("open", opened, { once: true });
      ws.addEventListener("error", failed, { once: true });
      ws.addEventListener("close", failed, { once: true });
    });
  };

  const finish = async (): Promise<AudioCapture> => {
    if (stopped) throw new MicrophoneError("That recording has already ended.", "empty");
    stopped = true;
    clearTimeout(timer);
    // Preserve the browser recognizer's final words before building capture.
    // This is essential when Sahara is unavailable because browserTranscript
    // is the immediate zero-credit STT resilience path.
    await stopBrowserRecognizer();
    teardown();

    const socketReady = await waitForSocket();
    if (socketReady) {
      flushFullChunks();
      if (pending.length >= 1024) sendChunk(pending);
      ws.send(JSON.stringify({ message_type: "COMMIT" }));
    }

    const final = socketReady
      ? await Promise.race([
          finalPromise,
          new Promise<string>((resolve) => setTimeout(() => resolve(committedTranscript), 3000)),
        ])
      : "";
    try {
      ws.close(1000);
    } catch {
      // The socket may already be closed after an upstream session failure.
    }
    committedTranscript = final.trim();
    const blob = pcm16Wav(recordedChunks);
    if (blob.size < 844)
      throw new MicrophoneError(
        "Dami didn't receive enough audio. Speak for a moment and try again.",
        "empty",
      );
    // Keep the recording so a failed or unavailable live Sahara session can be
    // retried automatically through the file-transcription endpoint.
    return {
      blob,
      mimeType: "audio/wav",
      extension: "wav",
      durationMs: Date.now() - startedAt,
      transcript: committedTranscript,
      partialTranscript: transcript.trim(),
      browserTranscript: browserTranscript.trim(),
      streamed: Boolean(committedTranscript),
    };
  };

  return {
    stop: finish,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      stopped = true;
      clearTimeout(timer);
      try { browserRecognizer?.abort(); } catch {}
      teardown();
      try {
        ws.close(1000);
      } catch {
        // The socket may already be closed after cancellation.
      }
    },
    level() {
      analyser.getFloatTimeDomainData(meter);
      let peak = 0;
      for (let i = 0; i < meter.length; i += 4) peak = Math.max(peak, Math.abs(meter[i] ?? 0));
      return Math.min(1, peak * 3);
    },
    transcript: () => transcript,
  };
}

async function saharaFinal(
  capture: AudioCapture,
  options: { language: string; codeSwitching: boolean },
) {
  const wav = new Uint8Array(await capture.blob.arrayBuffer());
  let pcm = wav,
    sampleRate = 16000;
  if (wav.length >= 44 && String.fromCharCode(...wav.subarray(0, 4)) === "RIFF") {
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    sampleRate = view.getUint32(24, true) || 16000;
    let offset = 12;
    while (offset + 8 <= wav.length) {
      const id = String.fromCharCode(...wav.subarray(offset, offset + 4));
      const size = view.getUint32(offset + 4, true);
      if (id === "data") {
        pcm = wav.subarray(offset + 8, Math.min(wav.length, offset + 8 + size));
        break;
      }
      offset += 8 + size + (size % 2);
    }
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch("/voice/stt", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64: toBase64(pcm),
        sampleRate,
        language: options.language || "en",
        codeSwitching: options.codeSwitching,
      }),
    });
  } finally {
    window.clearTimeout(timeout);
  }
  const raw = await response.text();
  let payload: {
    text?: string;
    durationMs?: number;
    requestId?: string | null;
    error?: string;
    engine?: "sahara-stt" | "groq-whisper-large-v3";
    language?: string;
  } | null = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  if (response.ok && payload?.text?.trim())
    return {
      text: payload.text.trim(),
      durationMs: payload.durationMs ?? 0,
      requestId: payload.requestId ?? null,
      engine: payload.engine ?? ("sahara-stt" as const),
      language: payload.language ?? options.language,
    };
  throw new Error(
    payload?.error?.trim() ||
      `Speech transcription failed (HTTP ${response.status}). Please try again.`,
  );
}

export async function transcribeSamples(
  capture: AudioCapture,
  options: { language: string; codeSwitching: boolean; browserTranscript?: string },
): Promise<TranscriptionResult> {
  if (capture.streamed && capture.transcript?.trim())
    return {
      text: capture.transcript.trim(),
      durationMs: capture.durationMs,
      requestId: null,
      engine: "sahara-stt",
      language: options.language,
    };
  // Prefer a committed Sahara result. If the file retry fails but the live
  // Sahara websocket already produced a usable hypothesis, keep that Sahara
  // transcript instead of falsely labelling it as Windows/browser speech.
  // Desktop wake capture does not set capture.partialTranscript, so its native
  // fallback remains correctly identified as windows-speech below.
  const liveSaharaTranscript = capture.partialTranscript?.trim();
  const localBrowserTranscript = capture.browserTranscript?.trim() || options.browserTranscript?.trim();
  try {
    return await saharaFinal(capture, options);
  } catch (error) {
    if (liveSaharaTranscript && !/insufficient balance|quota|credit|resource exhausted/i.test(error instanceof Error ? error.message : String(error)))
      return {
        text: liveSaharaTranscript,
        durationMs: capture.durationMs,
        requestId: null,
        engine: "sahara-stt",
        language: options.language,
      };

    // If Sahara cannot complete the turn (including quota/balance failures),
    // continue immediately with the locally captured browser transcript. This
    // is explicitly labelled browser-speech and never counted as Sahara in the
    // benchmark. Desktop wake text remains labelled windows-speech.
    if (localBrowserTranscript)
      return {
        text: localBrowserTranscript,
        durationMs: capture.durationMs,
        requestId: null,
        engine: capture.browserTranscript?.trim() ? "browser-speech" : "windows-speech",
        language: options.language,
      };
    throw error;
  }
}
