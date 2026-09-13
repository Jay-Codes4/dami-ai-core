/** Browser-side Dami speech. Sahara female African voice is primary; desktop local voice is immediate fallback. */
export interface SpeechHandle {
  stop(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  started: Promise<void>;
  ended: Promise<void>;
}
type VoiceOptions = { accent: string; gender: string; language: string };
type DesktopVoiceBridge = {
  isDesktop?: boolean;
  localSpeak?: (text: string) => Promise<boolean>;
  stopLocalSpeech?: () => Promise<boolean>;
};
const VOICE_TTS_WS_URL = (
  (import.meta.env.VITE_DAMI_VOICE_WS_URL as string | undefined) ||
  "wss://dami-ai-core-1.onrender.com/stt"
).replace(/\/stt(?:\?.*)?$/, "/tts");
const STREAM_START_TIMEOUT_MS = 4500;
function cleanSpeechText(text: string) {
  return text
    .replace(/\[(?:S\d+)\]/g, "")
    .replace(
      /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:short\s+answer|direct\s+answer|answer)(?:\*\*)?\s*[:-]?\s*/i,
      "",
    )
    .replace(/(^|\n)#{1,6}\s+/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\|/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}
function normaliseVoice(o: VoiceOptions): VoiceOptions {
  if (o.language === "sw") return { language: "sw", accent: "swahili", gender: "female" };
  if (o.language === "yo") return { language: "yo", accent: "yoruba", gender: "female" };
  if (o.language === "pcm") return { language: "pcm", accent: "pidgin", gender: "female" };
  return { language: "en", accent: o.accent || "yoruba", gender: "female" };
}
function browserSpeech(text: string, o: VoiceOptions): SpeechHandle {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    throw new Error("Dami couldn't play voice on this browser.");
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cleanSpeechText(text));
  u.lang = o.language === "en" ? "en-NG" : o.language;
  u.rate = 1.08;
  u.pitch = 1.02;
  const voices = window.speechSynthesis.getVoices(),
    knownFemale =
      /female|woman|aria|jenny|zira|hazel|susan|samantha|victoria|karen|moira|tessa|veena|fiona|serena|catherine|linda|ayanda/i,
    knownMale =
      /\b(?:male|david|mark|guy|george|james|daniel|alex|fred|aaron|arthur|andrew|ryan|christopher|eric|roger|stefan)\b/i,
    preferred =
      voices.find(
        (v) => knownFemale.test(v.name) && /en|nigeria|yoruba|africa/i.test(`${v.name} ${v.lang}`),
      ) ??
      voices.find(
        (v) =>
          knownFemale.test(v.name) &&
          !knownMale.test(v.name) &&
          v.lang.toLowerCase().startsWith("en"),
      );
  if (preferred) u.voice = preferred;
  let settled = false,
    paused = false,
    startedDone = false;
  let rs!: () => void, re!: () => void;
  const started = new Promise<void>((r) => (rs = r)),
    ended = new Promise<void>((r) => (re = r)),
    mark = () => {
      if (!startedDone) {
        startedDone = true;
        rs();
      }
    },
    finish = () => {
      mark();
      if (!settled) {
        settled = true;
        re();
      }
    };
  u.addEventListener("start", mark, { once: true });
  u.addEventListener("end", finish, { once: true });
  u.addEventListener("error", finish, { once: true });
  window.speechSynthesis.speak(u);
  return {
    stop() {
      window.speechSynthesis.cancel();
      paused = false;
      finish();
    },
    pause() {
      if (!settled && !paused) {
        window.speechSynthesis.pause();
        paused = true;
      }
    },
    resume() {
      if (!settled && paused) {
        window.speechSynthesis.resume();
        paused = false;
      }
    },
    isPaused: () => paused,
    started,
    ended,
  };
}
function nativeDesktopSpeech(text: string): SpeechHandle | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as typeof window & { damiDesktop?: DesktopVoiceBridge }).damiDesktop;
  if (!bridge?.isDesktop || !bridge.localSpeak) return null;
  let settled = false;
  let rs!: () => void, re!: () => void;
  const started = new Promise<void>((r) => (rs = r)),
    ended = new Promise<void>((r) => (re = r));
  rs();
  void bridge
    .localSpeak(cleanSpeechText(text))
    .catch(() => undefined)
    .finally(() => {
      if (!settled) {
        settled = true;
        re();
      }
    });
  return {
    stop() {
      void bridge.stopLocalSpeech?.();
      if (!settled) {
        settled = true;
        re();
      }
    },
    pause() {},
    resume() {},
    isPaused: () => false,
    started,
    ended,
  };
}
function splitForSahara(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean),
    chunks: string[] = [];
  let current = "";
  for (const sourceWord of words) {
    let word = sourceWord;
    while (word.length > 96) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(word.slice(0, 96));
      word = word.slice(96);
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= 96) current = candidate;
    else {
      if (current) chunks.push(current);
      current = word;
    }
  }
  if (current) chunks.push(current);
  if (chunks.length > 1 && chunks.at(-1)!.length < 10) {
    const tail = chunks.pop()!;
    if (`${chunks.at(-1)} ${tail}`.length <= 100) chunks[chunks.length - 1] += ` ${tail}`;
    else chunks.push(tail);
  }
  return chunks.every((chunk) => chunk.length >= 10 && chunk.length <= 100) ? chunks : [];
}

function audioBlob(base64: string, extension: string | undefined) {
  const binary = atob(base64),
    bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const mime = extension?.toLowerCase().includes("opus") ? "audio/opus" : "audio/wav";
  return new Blob([bytes], { type: mime });
}

async function saharaSpeech(text: string, o: VoiceOptions): Promise<SpeechHandle | null> {
  const clean = cleanSpeechText(text),
    chunks = splitForSahara(clean);
  if (!chunks.length || typeof WebSocket === "undefined") return null;

  const url = new URL(VOICE_TTS_WS_URL);
  url.searchParams.set("voice_accent", o.accent);
  url.searchParams.set("voice_gender", "female");
  url.searchParams.set("voice_language", o.language);
  url.searchParams.set("output_audio_format", "wav");

  type Deferred = {
    promise: Promise<Blob>;
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
    settled: boolean;
    polls: number;
  };
  const deferreds: Deferred[] = chunks.map(() => {
    let resolve!: (blob: Blob) => void, reject!: (error: Error) => void;
    const promise = new Promise<Blob>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject, settled: false, polls: 0 };
  });
  // Later chunks may reject before playback reaches them. Attach a handler now
  // so a gateway failure never becomes an unhandled browser rejection.
  for (const deferred of deferreds) void deferred.promise.catch(() => undefined);
  const socket = new WebSocket(url),
    terminalTypes = new Set([
      "AUTHENTICATION_ERROR",
      "RESOURCE_EXHAUSTED",
      "QUOTA_EXCEEDED",
      "SESSION_TIME_LIMIT_EXCEEDED",
      "INSUFFICIENT_TEXT_ACTIVITY",
      "CHUNK_ID_MISMATCH_WITH_TOTAL",
      "CHUNK_SIZE_TOO_SMALL",
      "CHUNK_SIZE_TOO_LARGE",
      "INPUT_ERROR",
      "GATEWAY_ERROR",
      "ERROR",
    ]);
  let failed = false,
    committed = false;
  const fail = (message: string) => {
      if (failed) return;
      failed = true;
      const error = new Error(message);
      for (const deferred of deferreds) {
        if (!deferred.settled) {
          deferred.settled = true;
          deferred.reject(error);
        }
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
        socket.close();
    },
    fetchChunk = (chunkId: number) => {
      const deferred = deferreds[chunkId - 1];
      if (!deferred || deferred.settled || failed || socket.readyState !== WebSocket.OPEN) return;
      deferred.polls += 1;
      if (deferred.polls > 80) {
        fail("Sahara voice took too long to prepare audio.");
        return;
      }
      socket.send(JSON.stringify({ message_type: "FETCH_AUDIO_CHUNK", chunk_id: chunkId }));
    };

  socket.addEventListener("open", () => {
    chunks.forEach((chunk, index) =>
      socket.send(
        JSON.stringify({ message_type: "INPUT_TEXT_CHUNK", text: chunk, ack_id: index + 1 }),
      ),
    );
  });
  socket.addEventListener("message", (event) => {
    let message: {
      message_type?: string;
      message?: string;
      chunk_id?: number;
      ack_id?: number;
      processing_status?: string;
      processing_staus?: string;
      audio_base_64?: string;
      extension?: string;
    };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const type = message.message_type || "";
    if (terminalTypes.has(type)) {
      fail(message.message || "Sahara streaming voice is unavailable.");
      return;
    }
    const chunkId = Number(message.chunk_id ?? message.ack_id ?? 0);
    if (type === "TEXT_CHUNK_ACK" && chunkId) {
      fetchChunk(chunkId);
      return;
    }
    if (type === "FETCH_AUDIO_CHUNK" && chunkId) {
      const deferred = deferreds[chunkId - 1];
      if (!deferred || deferred.settled) return;
      if (message.audio_base_64) {
        try {
          const blob = audioBlob(message.audio_base_64, message.extension);
          deferred.settled = true;
          deferred.resolve(blob);
        } catch {
          fail("Sahara returned an unreadable voice chunk.");
          return;
        }
        if (!committed && deferreds.every((item) => item.settled)) {
          committed = true;
          socket.send(JSON.stringify({ message_type: "COMMIT" }));
        }
      } else {
        const status = message.processing_status ?? message.processing_staus ?? "PROCESSING";
        if (/error|failed/i.test(status)) fail("Sahara could not prepare that voice chunk.");
        else window.setTimeout(() => fetchChunk(chunkId), 120);
      }
    }
  });
  socket.addEventListener("error", () => fail("Dami could not connect to Sahara voice."));
  socket.addEventListener("close", () => {
    if (!committed && deferreds.some((item) => !item.settled))
      fail("Sahara closed the voice session early.");
  });

  let firstBlob: Blob;
  let startTimer = 0;
  try {
    firstBlob = await Promise.race([
      deferreds[0].promise,
      new Promise<Blob>(
        (_resolve, reject) =>
          (startTimer = window.setTimeout(
            () => reject(new Error("Sahara voice did not start quickly enough.")),
            STREAM_START_TIMEOUT_MS,
          )),
      ),
    ]);
  } catch {
    fail("Sahara voice did not start quickly enough.");
    return null;
  } finally {
    window.clearTimeout(startTimer);
  }

  let stopped = false,
    paused = false,
    settled = false,
    startedDone = false,
    current: HTMLAudioElement | null = null;
  let resolveStarted!: () => void, resolveEnded!: () => void;
  const started = new Promise<void>((resolve) => (resolveStarted = resolve)),
    ended = new Promise<void>((resolve) => (resolveEnded = resolve)),
    markStarted = () => {
      if (!startedDone) {
        startedDone = true;
        resolveStarted();
      }
    },
    finish = () => {
      markStarted();
      if (!settled) {
        settled = true;
        resolveEnded();
      }
    },
    playBlob = async (blob: Blob) => {
      const objectUrl = URL.createObjectURL(blob),
        audio = new Audio(objectUrl);
      current = audio;
      audio.preload = "auto";
      audio.playbackRate = 1.04;
      try {
        await audio.play();
        markStarted();
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("ended", () => resolve(), { once: true });
          audio.addEventListener("error", () => reject(new Error("Voice playback failed.")), {
            once: true,
          });
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

  void (async () => {
    let index = 0;
    try {
      await playBlob(firstBlob);
      for (index = 1; index < deferreds.length && !stopped; index++)
        await playBlob(await deferreds[index].promise);
    } catch {
      if (!stopped) {
        const remaining = chunks.slice(index).join(" ") || clean,
          fallback = nativeDesktopSpeech(remaining) ?? browserSpeech(remaining, o);
        await fallback.started;
        markStarted();
        await fallback.ended;
      }
    } finally {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
        socket.close();
      finish();
    }
  })();

  return {
    stop() {
      stopped = true;
      current?.pause();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
        socket.close();
      finish();
    },
    pause() {
      if (!paused) {
        paused = true;
        current?.pause();
      }
    },
    resume() {
      if (paused) {
        paused = false;
        void current?.play();
      }
    },
    isPaused: () => paused,
    started,
    ended,
  };
}
export async function speak(text: string, requested: VoiceOptions): Promise<SpeechHandle> {
  const clean = cleanSpeechText(text),
    o = normaliseVoice(requested);
  const sahara = await saharaSpeech(clean, o).catch(() => null);
  if (sahara) return sahara;
  return nativeDesktopSpeech(clean) ?? browserSpeech(clean, o);
}
