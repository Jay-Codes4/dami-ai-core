/** Browser-side Dami speech. Sahara female African voice is primary. */
export interface SpeechHandle {
  stop(): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
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

function sentenceChunks(text: string) {
  const clean = cleanSpeechText(text);
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= 120) chunks.push(sentence);
    else chunks.push(...splitLong(sentence, 105));
  }
  // Keep the first chunk small so playback can begin as soon as possible.
  if (chunks[0] && chunks[0].length > 85) {
    const first = splitLong(chunks.shift()!, 80);
    chunks.unshift(...first);
  }
  return chunks.filter((chunk) => chunk.length >= 2);
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
  let settle!: () => void;
  const ended = new Promise<void>((resolve) => { settle = resolve; });
  const finish = () => { if (!settled) { settled = true; settle(); } };
  u.addEventListener("end", finish, { once: true });
  u.addEventListener("error", finish, { once: true });
  window.speechSynthesis.speak(u);
  return {
    stop() { window.speechSynthesis.cancel(); paused = false; finish(); },
    pause() { if (!settled && !paused) { window.speechSynthesis.pause(); paused = true; } },
    resume() { if (!settled && paused) { window.speechSynthesis.resume(); paused = false; } },
    isPaused: () => paused,
    ended,
  };
}

async function requestChunk(text: string, o: VoiceOptions) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
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

async function saharaSpeech(text: string, o: VoiceOptions): Promise<SpeechHandle | null> {
  const chunks = sentenceChunks(text);
  if (!chunks.length) return null;

  let stopped = false;
  let paused = false;
  let settled = false;
  let currentAudio: HTMLAudioElement | null = null;
  const urls = new Set<string>();
  let resumeWaiters: Array<() => void> = [];
  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => { resolveEnded = resolve; });
  const finish = () => {
    if (settled) return;
    settled = true;
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    resolveEnded();
  };
  const waitUntilResumed = async () => {
    if (!paused || stopped) return;
    await new Promise<void>((resolve) => resumeWaiters.push(resolve));
  };

  // Start generating every chunk immediately. Playback awaits only the chunk it needs,
  // which removes the sentence-to-sentence network gap.
  const pending = chunks.map((chunk) => requestChunk(chunk, o));

  void (async () => {
    try {
      for (let i = 0; i < pending.length && !stopped; i++) {
        await waitUntilResumed();
        if (stopped) break;
        const blob = await pending[i];
        if (!blob) throw new Error("Sahara voice unavailable");
        const url = URL.createObjectURL(blob);
        urls.add(url);
        const audio = new Audio(url);
        currentAudio = audio;
        audio.preload = "auto";
        await audio.play();
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("ended", () => resolve(), { once: true });
          audio.addEventListener("error", () => reject(new Error("Audio playback failed.")), { once: true });
        });
        currentAudio = null;
        URL.revokeObjectURL(url);
        urls.delete(url);
      }
    } catch {
      if (!stopped) {
        const fallback = browserSpeech(chunks.join(" "), o);
        if (paused) fallback.pause();
        currentAudio = null;
        await fallback.ended;
      }
    } finally {
      finish();
    }
  })();

  return {
    stop() {
      stopped = true;
      paused = false;
      currentAudio?.pause();
      currentAudio = null;
      for (const release of resumeWaiters.splice(0)) release();
      finish();
    },
    pause() {
      if (stopped || settled || paused) return;
      paused = true;
      currentAudio?.pause();
    },
    resume() {
      if (stopped || settled || !paused) return;
      paused = false;
      if (currentAudio) void currentAudio.play().catch(() => undefined);
      for (const release of resumeWaiters.splice(0)) release();
    },
    isPaused: () => paused,
    ended,
  };
}

export async function speak(text: string, requested: VoiceOptions): Promise<SpeechHandle> {
  const o = normaliseVoice(requested);
  await prepareAudioPlayback().catch(() => undefined);
  const handle = await saharaSpeech(cleanSpeechText(text), o).catch(() => null);
  return handle ?? browserSpeech(text, o);
}
