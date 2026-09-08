/** Browser-side Dami speech. Sahara female African voice is primary. */
export interface SpeechHandle {
  stop(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  started: Promise<void>;
  ended: Promise<void>;
}

type VoiceOptions = { accent: string; gender: string; language: string };
let sharedAudioContext: AudioContext | null = null;

export async function prepareAudioPlayback() {
  if (typeof window === "undefined") return;
  const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  sharedAudioContext ??= new AudioCtx();
  if (sharedAudioContext.state === "suspended") await sharedAudioContext.resume();
  const source = sharedAudioContext.createBufferSource();
  source.buffer = sharedAudioContext.createBuffer(1, 1, sharedAudioContext.sampleRate);
  source.connect(sharedAudioContext.destination);
  source.start(0);
}

function cleanSpeechText(text: string) {
  return text
    .replace(/\[(?:S\d+)\]/g, "")
    .replace(/(^|\n)#{1,6}\s+/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\|/g, ", ")
    .replace(/\s*[:;]\s*/g, ", ")
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

function splitLong(text: string, limit: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const next = `${current} ${word}`.trim();
    if (!current || next.length <= limit) current = next;
    else { chunks.push(current); current = word; }
  }
  if (current) chunks.push(current);
  return chunks;
}

function speechChunks(text: string) {
  const clean = cleanSpeechText(text);
  if (!clean) return [];
  // Keep only the opening phrase tiny for fast first audio. Everything after it is
  // deliberately much larger so there are far fewer network/audio boundaries.
  const firstParts = splitLong(clean, 52);
  const first = firstParts.shift();
  if (!first) return [];
  const remainder = firstParts.join(" ");
  return [first, ...splitLong(remainder, 1200)].filter(Boolean);
}

function browserSpeech(text: string, o: VoiceOptions): SpeechHandle {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) throw new Error("Dami couldn't play voice on this browser.");
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(cleanSpeechText(text));
  u.lang = o.language === "en" ? "en-NG" : o.language;
  u.rate = 1.12;
  u.pitch = 1.03;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) => /female|woman|aria|jenny|zira/i.test(v.name) && /en|nigeria|yoruba|africa/i.test(`${v.name} ${v.lang}`))
    ?? voices.find((v) => !/male/i.test(v.name) && v.lang.toLowerCase().startsWith("en"));
  if (preferred) u.voice = preferred;

  let settled = false;
  let paused = false;
  let startedDone = false;
  let resolveStarted!: () => void;
  let resolveEnded!: () => void;
  const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
  const ended = new Promise<void>((resolve) => { resolveEnded = resolve; });
  const markStarted = () => { if (!startedDone) { startedDone = true; resolveStarted(); } };
  const finish = () => { markStarted(); if (!settled) { settled = true; resolveEnded(); } };
  u.addEventListener("start", markStarted, { once: true });
  u.addEventListener("end", finish, { once: true });
  u.addEventListener("error", finish, { once: true });
  window.speechSynthesis.speak(u);

  return {
    stop() { window.speechSynthesis.cancel(); paused = false; finish(); },
    pause() { if (!settled && !paused) { window.speechSynthesis.pause(); paused = true; } },
    resume() { if (!settled && paused) { window.speechSynthesis.resume(); paused = false; } },
    isPaused: () => paused,
    started,
    ended,
  };
}

async function requestChunk(text: string, o: VoiceOptions) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    let response = await fetch("/api/sahara-tts", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...o, gender: "female" }),
    });
    if ((response.status === 404 || response.status === 405) && !controller.signal.aborted) {
      response = await fetch("/api/sahara/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...o, gender: "female" }),
      });
    }
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size ? blob : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type PreparedAudio = { audio: HTMLAudioElement; url: string };

async function prepareChunk(text: string, o: VoiceOptions): Promise<PreparedAudio | null> {
  const blob = await requestChunk(text, o);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.playbackRate = 1.04;
  try { audio.load(); } catch { /* no-op */ }
  return { audio, url };
}

async function saharaSpeech(text: string, o: VoiceOptions): Promise<SpeechHandle | null> {
  const chunks = speechChunks(text);
  if (!chunks.length) return null;

  let stopped = false;
  let paused = false;
  let settled = false;
  let startedDone = false;
  let currentAudio: HTMLAudioElement | null = null;
  let currentIndex = -1;
  let fallbackHandle: SpeechHandle | null = null;
  let resumeWaiters: Array<() => void> = [];
  let resolveStarted!: () => void;
  let resolveEnded!: () => void;
  const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
  const ended = new Promise<void>((resolve) => { resolveEnded = resolve; });
  const markStarted = () => { if (!startedDone) { startedDone = true; resolveStarted(); } };

  // Prepare every audio element immediately, not merely the blob. This means a
  // resumed or next chunk can start without having to construct/load a new player.
  const prepared = chunks.map((chunk) => prepareChunk(chunk, o));
  const preparedUrls = new Set<string>();

  const cleanupPrepared = async () => {
    for (let i = 0; i < prepared.length; i++) {
      try {
        const item = await Promise.race([prepared[i], Promise.resolve(null)]);
        if (item?.url) preparedUrls.add(item.url);
      } catch { /* no-op */ }
    }
    for (const url of preparedUrls) URL.revokeObjectURL(url);
    preparedUrls.clear();
  };

  const finish = () => {
    if (settled) return;
    settled = true;
    markStarted();
    void cleanupPrepared();
    resolveEnded();
  };
  const waitUntilResumed = async () => {
    if (!paused || stopped) return;
    await new Promise<void>((resolve) => resumeWaiters.push(resolve));
  };

  void (async () => {
    try {
      for (let i = 0; i < prepared.length && !stopped; i++) {
        currentIndex = i;
        await waitUntilResumed();
        if (stopped) break;
        const item = await prepared[i];
        if (!item) throw new Error("Sahara voice unavailable");
        preparedUrls.add(item.url);
        currentAudio = item.audio;
        await waitUntilResumed();
        if (stopped) break;
        item.audio.addEventListener("playing", markStarted, { once: true });
        await item.audio.play();
        if (paused) item.audio.pause();
        await new Promise<void>((resolve, reject) => {
          item.audio.addEventListener("ended", () => resolve(), { once: true });
          item.audio.addEventListener("error", () => reject(new Error("Audio playback failed.")), { once: true });
        });
        currentAudio = null;
      }
    } catch {
      if (!stopped) {
        fallbackHandle = browserSpeech(chunks.join(" "), o);
        if (paused) fallbackHandle.pause();
        void fallbackHandle.started.then(markStarted);
        await fallbackHandle.ended;
      }
    } finally {
      finish();
    }
  })();

  return {
    stop() {
      stopped = true;
      paused = false;
      fallbackHandle?.stop();
      currentAudio?.pause();
      currentAudio = null;
      for (const release of resumeWaiters.splice(0)) release();
      finish();
    },
    pause() {
      if (stopped || settled || paused) return;
      paused = true;
      fallbackHandle?.pause();
      currentAudio?.pause();
    },
    resume() {
      if (stopped || settled || !paused) return;
      paused = false;
      fallbackHandle?.resume();
      // If we are paused in the middle of audio, this continues from the exact
      // currentTime immediately in the user's click gesture.
      if (currentAudio?.paused) void currentAudio.play().catch(() => undefined);
      for (const release of resumeWaiters.splice(0)) release();
      // If pause happened exactly between chunks, eagerly kick the already-prepared
      // next player as soon as it resolves rather than waiting for another UI event.
      if (!currentAudio && currentIndex >= 0 && currentIndex + 1 < prepared.length) {
        void prepared[currentIndex + 1].then((next) => {
          if (!next || stopped || paused || currentAudio) return;
          next.audio.play().then(() => next.audio.pause()).catch(() => undefined);
          next.audio.currentTime = 0;
        });
      }
    },
    isPaused: () => paused,
    started,
    ended,
  };
}

export async function speak(text: string, requested: VoiceOptions): Promise<SpeechHandle> {
  const o = normaliseVoice(requested);
  await prepareAudioPlayback().catch(() => undefined);
  const handle = await saharaSpeech(cleanSpeechText(text), o).catch(() => null);
  return handle ?? browserSpeech(text, o);
}
