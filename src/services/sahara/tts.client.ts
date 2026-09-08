/** Browser-side Dami speech. Sahara female Yoruba is primary. */
export interface SpeechHandle {
  stop(): void;
  ended: Promise<void>;
}

type VoiceOptions = { accent: string; gender: string; language: string };
type StreamMessage = {
  message_type?: string;
  chunk_id?: number;
  processing_status?: string;
  processing_staus?: string;
  audio_base_64?: string;
  extension?: string;
  message?: string;
};

const STREAM_MIN_CHARS = 10;
const STREAM_MAX_CHARS = 92;
const FETCH_RETRY_MS = 120;
let sharedAudioContext: AudioContext | null = null;

export async function prepareAudioPlayback(): Promise<void> {
  if (typeof window === "undefined") return;
  const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  sharedAudioContext ??= new AudioCtx();
  if (sharedAudioContext.state === "suspended") await sharedAudioContext.resume();
  // Unlock audio during the user's click/tap so playback remains permitted when
  // the researched answer arrives several seconds later.
  const source = sharedAudioContext.createBufferSource();
  source.buffer = sharedAudioContext.createBuffer(1, 1, sharedAudioContext.sampleRate);
  source.connect(sharedAudioContext.destination);
  source.start(0);
}

function cleanSpeechText(text: string) {
  return text
    .replace(/\[(?:S\d+)\]/g, "")
    .replace(/(^|\n)#{1,6}\s+/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseVoice(options: VoiceOptions): VoiceOptions {
  if (options.language === "sw") return { language: "sw", accent: "swahili", gender: "female" };
  if (options.language === "yo") return { language: "yo", accent: "yoruba", gender: "female" };
  if (options.language === "pcm") return { language: "pcm", accent: "pidgin", gender: "female" };
  return { language: "en", accent: "yoruba", gender: "female" };
}

function chunkForStreaming(text: string): string[] {
  const words = cleanSpeechText(text).split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const next = `${current} ${word}`.trim();
    if (next.length <= STREAM_MAX_CHARS) current = next;
    else {
      if (current) chunks.push(current);
      current = word;
    }
  }
  if (current) chunks.push(current);
  if (chunks.length > 1 && chunks.at(-1)!.length < STREAM_MIN_CHARS) {
    const tail = chunks.pop()!;
    const previous = chunks.pop()!;
    chunks.push(`${previous} ${tail}`.slice(0, 100));
  }
  return chunks.filter((chunk) => chunk.length >= STREAM_MIN_CHARS && chunk.length <= 100);
}

function base64ToBlob(base64: string, extension = ".wav") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: extension.includes("opus") ? "audio/opus" : "audio/wav" });
}

async function playBlob(blob: Blob, isStopped: () => boolean) {
  if (isStopped()) return;
  await prepareAudioPlayback();
  if (sharedAudioContext) {
    const data = await blob.arrayBuffer();
    const decoded = await sharedAudioContext.decodeAudioData(data.slice(0));
    if (isStopped()) return;
    await new Promise<void>((resolve) => {
      const source = sharedAudioContext!.createBufferSource();
      source.buffer = decoded;
      source.connect(sharedAudioContext!.destination);
      source.addEventListener("ended", () => resolve(), { once: true });
      source.start(0);
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio(url);
    await audio.play();
    await new Promise<void>((resolve, reject) => {
      audio.addEventListener("ended", () => resolve(), { once: true });
      audio.addEventListener("error", () => reject(new Error("Audio playback failed.")), { once: true });
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function browserSpeech(text: string, options: VoiceOptions): SpeechHandle {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    throw new Error("Dami couldn't play voice on this browser.");
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.language === "en" ? "en-NG" : options.language;
  utterance.rate = 0.96;
  utterance.pitch = 1.08;
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((voice) => /female|woman/i.test(voice.name) && /nigeria|yoruba|africa/i.test(`${voice.name} ${voice.lang}`)) ??
    voices.find((voice) => !/male/i.test(voice.name) && voice.lang.toLowerCase().startsWith("en"));
  if (preferred) utterance.voice = preferred;

  let settle!: () => void;
  const ended = new Promise<void>((resolve) => { settle = resolve; });
  utterance.addEventListener("end", settle, { once: true });
  utterance.addEventListener("error", settle, { once: true });
  window.speechSynthesis.speak(utterance);
  return { stop() { window.speechSynthesis.cancel(); settle(); }, ended };
}

async function speakRest(text: string, options: VoiceOptions): Promise<SpeechHandle | null> {
  const response = await fetch("/api/sahara/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: cleanSpeechText(text).slice(0, 4096), ...options, gender: "female" }),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string };
    console.warn("Sahara REST TTS unavailable", response.status, detail.error);
    return null;
  }
  const blob = await response.blob();
  if (!blob.size) return null;
  let stopped = false;
  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => { resolveEnded = resolve; });
  void playBlob(blob, () => stopped).catch((error) => console.warn("Sahara audio playback failed", error)).finally(resolveEnded);
  return { stop() { stopped = true; resolveEnded(); }, ended };
}

async function fallbackSpeech(text: string, options: VoiceOptions): Promise<SpeechHandle> {
  try {
    const rest = await speakRest(text, options);
    if (rest) return rest;
  } catch (error) {
    console.warn("Sahara REST TTS failed", error);
  }
  return browserSpeech(text, options);
}

async function speakStreaming(text: string, options: VoiceOptions): Promise<SpeechHandle | null> {
  const chunks = chunkForStreaming(text);
  if (!chunks.length) return null;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({
    voice_accent: options.accent,
    voice_gender: "female",
    voice_language: options.language,
    output_audio_format: "wav",
  });
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/dami-tts-stream?${params}`);

  let stopped = false;
  let finished = false;
  let played = 0;
  let nextToPlay = 1;
  let playbackRunning = false;
  let fallbackHandle: SpeechHandle | null = null;
  const readyAudio = new Map<number, Blob>();
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();

  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => { resolveEnded = resolve; });
  const settle = () => {
    if (finished) return;
    finished = true;
    for (const timer of retryTimers) clearTimeout(timer);
    retryTimers.clear();
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    resolveEnded();
  };

  const useFallback = async () => {
    if (stopped || finished || fallbackHandle) return;
    const remaining = chunks.slice(Math.min(played, chunks.length)).join(" ") || cleanSpeechText(text);
    try {
      fallbackHandle = await fallbackSpeech(remaining, options);
      await fallbackHandle.ended;
    } finally {
      settle();
    }
  };

  const maybePlay = async () => {
    if (playbackRunning || stopped || finished) return;
    playbackRunning = true;
    try {
      while (!stopped) {
        const blob = readyAudio.get(nextToPlay);
        if (!blob) break;
        readyAudio.delete(nextToPlay);
        await playBlob(blob, () => stopped);
        played += 1;
        nextToPlay += 1;
      }
      if (played === chunks.length) {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ message_type: "COMMIT" }));
        settle();
      }
    } catch (error) {
      console.warn("Streaming audio playback failed; using fallback", error);
      void useFallback();
    } finally {
      playbackRunning = false;
    }
  };

  const fetchChunk = (chunkId: number) => {
    if (!stopped && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ message_type: "FETCH_AUDIO_CHUNK", chunk_id: chunkId }));
    }
  };

  socket.addEventListener("message", (event) => {
    let message: StreamMessage;
    try { message = JSON.parse(String(event.data)) as StreamMessage; }
    catch { void useFallback(); return; }

    if (message.message_type === "SESSION_CREATED") {
      chunks.forEach((chunk, index) => socket.send(JSON.stringify({ message_type: "INPUT_TEXT_CHUNK", text: chunk, ack_id: index + 1 })));
      return;
    }
    if (message.message_type === "TEXT_CHUNK_ACK" && message.chunk_id) {
      fetchChunk(message.chunk_id);
      return;
    }
    if (message.message_type === "FETCH_AUDIO_CHUNK" && message.chunk_id) {
      const status = message.processing_status ?? message.processing_staus;
      if (status === "READY" && message.audio_base_64) {
        readyAudio.set(message.chunk_id, base64ToBlob(message.audio_base_64, message.extension));
        void maybePlay();
      } else {
        const timer = setTimeout(() => { retryTimers.delete(timer); fetchChunk(message.chunk_id!); }, FETCH_RETRY_MS);
        retryTimers.add(timer);
      }
      return;
    }
    if (["AUTHENTICATION_ERROR", "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED", "ERROR", "INPUT_ERROR", "PROXY_ERROR", "CHUNK_SIZE_TOO_SMALL", "CHUNK_SIZE_TOO_LARGE"].includes(message.message_type ?? "")) {
      console.warn("Sahara streaming TTS error", message.message_type, message.message);
      void useFallback();
    }
  });

  const opened = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 3500);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(true); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); resolve(false); }, { once: true });
  });
  if (!opened) {
    stopped = true;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    return null;
  }

  socket.addEventListener("close", () => {
    if (!finished && !stopped && played < chunks.length) void useFallback();
  });
  socket.addEventListener("error", () => {
    if (!finished && !stopped) void useFallback();
  });

  return {
    stop() {
      stopped = true;
      fallbackHandle?.stop();
      settle();
    },
    ended,
  };
}

export async function speak(text: string, requested: VoiceOptions): Promise<SpeechHandle> {
  const options = normaliseVoice(requested);
  await prepareAudioPlayback().catch(() => undefined);
  try {
    const streaming = await speakStreaming(text, options);
    if (streaming) return streaming;
  } catch (error) {
    console.warn("Sahara streaming TTS failed before start", error);
  }
  return fallbackSpeech(text, options);
}
