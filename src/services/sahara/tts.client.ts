/**
 * Browser side of Dami text-to-speech.
 *
 * Primary path: secure same-origin WebSocket proxy -> Sahara streaming TTS.
 * The Intron API key never reaches the browser. Dami forces a female Sahara
 * voice and starts playback as soon as the first generated chunk is ready.
 * REST Sahara TTS is the first fallback; browser speech is last-resort only.
 */

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
const FETCH_RETRY_MS = 90;

function cleanSpeechText(text: string) {
  return text
    .replace(/\[(?:S\d+)\]/g, "")
    .replace(/(^|\n)#{1,6}\s+/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkForStreaming(text: string): string[] {
  const cleaned = cleanSpeechText(text);
  if (!cleaned) return [];

  const words = cleaned.split(/\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const next = (current + " " + word).trim();
    if (next.length <= STREAM_MAX_CHARS) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    current = word;
  }
  if (current) chunks.push(current);

  if (chunks.length > 1 && chunks[chunks.length - 1]!.length < STREAM_MIN_CHARS) {
    const tail = chunks.pop()!;
    const previous = chunks.pop()!;
    if (`${previous} ${tail}`.length <= 100) chunks.push(`${previous} ${tail}`);
    else {
      const splitAt = Math.max(STREAM_MIN_CHARS, previous.length - Math.max(STREAM_MIN_CHARS - tail.length + 1, 1));
      const head = previous.slice(0, splitAt).trim();
      const moved = previous.slice(splitAt).trim();
      chunks.push(head, `${moved} ${tail}`.trim());
    }
  }

  return chunks.filter((chunk) => chunk.length >= STREAM_MIN_CHARS && chunk.length <= 100);
}

function normaliseVoice(options: VoiceOptions): VoiceOptions {
  const language = options.language || "en";
  if (language === "sw") return { language: "sw", accent: "swahili", gender: "female" };
  if (language === "yo") return { language: "yo", accent: "yoruba", gender: "female" };
  if (language === "pcm") return { language: "pcm", accent: "pidgin", gender: "female" };
  // Sahara currently has no Ghanaian/Twi English TTS accent. Yoruba is the
  // closest supported West-African English voice in the current catalogue.
  return { language: "en", accent: "yoruba", gender: "female" };
}

function base64ToBlob(base64: string, extension = ".wav") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const mime = extension.includes("opus") ? "audio/opus" : "audio/wav";
  return new Blob([bytes], { type: mime });
}

async function playBlob(blob: Blob, isStopped: () => boolean, setActive: (audio: HTMLAudioElement | null, url: string | null) => void) {
  if (isStopped()) return;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  setActive(audio, url);
  try {
    await audio.play();
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      audio.addEventListener("ended", done, { once: true });
      audio.addEventListener("error", done, { once: true });
    });
  } finally {
    URL.revokeObjectURL(url);
    setActive(null, null);
  }
}

function browserSpeech(text: string, options: VoiceOptions): SpeechHandle {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    throw new Error("Dami couldn't play voice on this browser.");
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.language === "en" ? "en-GH" : options.language;
  utterance.rate = 0.96;
  utterance.pitch = 1.08;

  const voices = window.speechSynthesis.getVoices();
  const matching = voices.filter((voice) => !/male/i.test(voice.name));
  const preferred =
    matching.find((voice) => voice.lang.toLowerCase() === "en-gh") ??
    matching.find((voice) => /ghana|africa|african|yoruba|hausa|igbo/i.test(voice.name)) ??
    matching[0];
  if (preferred) utterance.voice = preferred;

  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    resolveEnded();
  };
  utterance.addEventListener("end", settle);
  utterance.addEventListener("error", settle);
  window.speechSynthesis.speak(utterance);

  return {
    stop() {
      window.speechSynthesis.cancel();
      settle();
    },
    ended,
  };
}

async function speakRest(text: string, options: VoiceOptions): Promise<SpeechHandle | null> {
  const response = await fetch("/api/sahara/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...options }),
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  if (!blob.size) return null;

  let stopped = false;
  let activeAudio: HTMLAudioElement | null = null;
  let activeUrl: string | null = null;
  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });

  void playBlob(
    blob,
    () => stopped,
    (audio, url) => {
      activeAudio = audio;
      activeUrl = url;
    },
  ).finally(resolveEnded);

  return {
    stop() {
      stopped = true;
      activeAudio?.pause();
      if (activeUrl) URL.revokeObjectURL(activeUrl);
      resolveEnded();
    },
    ended,
  };
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
  let failed = false;
  let activeAudio: HTMLAudioElement | null = null;
  let activeUrl: string | null = null;
  let nextToPlay = 1;
  let played = 0;
  let commitSent = false;
  let playbackRunning = false;
  const readyAudio = new Map<number, Blob>();
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();

  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    for (const timer of retryTimers) clearTimeout(timer);
    retryTimers.clear();
    activeAudio?.pause();
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    resolveEnded();
  };

  const maybePlay = async () => {
    if (playbackRunning || stopped || failed) return;
    playbackRunning = true;
    try {
      while (!stopped) {
        const blob = readyAudio.get(nextToPlay);
        if (!blob) break;
        readyAudio.delete(nextToPlay);
        await playBlob(
          blob,
          () => stopped,
          (audio, url) => {
            activeAudio = audio;
            activeUrl = url;
          },
        );
        played += 1;
        nextToPlay += 1;
      }
      if (played === chunks.length && commitSent) finish();
    } finally {
      playbackRunning = false;
    }
  };

  const fetchChunk = (chunkId: number) => {
    if (stopped || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ message_type: "FETCH_AUDIO_CHUNK", chunk_id: chunkId }));
  };

  socket.addEventListener("message", (event) => {
    let message: StreamMessage;
    try {
      message = JSON.parse(String(event.data)) as StreamMessage;
    } catch {
      failed = true;
      finish();
      return;
    }

    if (message.message_type === "SESSION_CREATED") {
      chunks.forEach((chunk, index) => {
        socket.send(JSON.stringify({ message_type: "INPUT_TEXT_CHUNK", text: chunk, ack_id: index + 1 }));
      });
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
        if (readyAudio.size + played === chunks.length && !commitSent) {
          commitSent = true;
          socket.send(JSON.stringify({ message_type: "COMMIT" }));
        }
      } else {
        const timer = setTimeout(() => {
          retryTimers.delete(timer);
          fetchChunk(message.chunk_id!);
        }, FETCH_RETRY_MS);
        retryTimers.add(timer);
      }
      return;
    }

    if (["AUTHENTICATION_ERROR", "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED", "ERROR", "INPUT_ERROR", "PROXY_ERROR"].includes(message.message_type ?? "")) {
      console.warn("Sahara streaming TTS error", message.message_type, message.message);
      failed = true;
      finish();
    }
  });

  const opened = new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 4000);
    socket.addEventListener("open", () => {
      clearTimeout(timeout);
      resolve(true);
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      resolve(false);
    }, { once: true });
  });

  if (!(await opened)) {
    failed = true;
    finish();
    return null;
  }

  return {
    stop() {
      stopped = true;
      finish();
    },
    ended,
  };
}

export async function speak(text: string, requested: VoiceOptions): Promise<SpeechHandle> {
  const options = normaliseVoice(requested);

  try {
    const streaming = await speakStreaming(text, options);
    if (streaming) return streaming;
  } catch (error) {
    console.warn("Sahara streaming TTS failed; falling back to REST", error);
  }

  try {
    const rest = await speakRest(cleanSpeechText(text).slice(0, 4096), options);
    if (rest) return rest;
  } catch (error) {
    console.warn("Sahara REST TTS failed; using browser fallback", error);
  }

  return browserSpeech(text, options);
}
