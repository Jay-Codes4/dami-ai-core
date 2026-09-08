/**
 * Browser side of Dami text-to-speech.
 *
 * Sahara TTS is the primary voice path. Long answers are split into short
 * speakable chunks so Dami can start talking sooner instead of waiting for one
 * large audio file. While one chunk plays, the next Sahara chunk is prefetched.
 * If Sahara is unavailable, Dami falls back to the best Ghana/Africa female
 * voice exposed by the browser.
 */

export interface SpeechHandle {
  stop(): void;
  ended: Promise<void>;
}

type VoiceOptions = { accent: string; gender: string; language: string };

const MAX_TTS_CHUNK = 280;

function chunkText(text: string): string[] {
  const cleaned = text
    .replace(/\[(?:S\d+)\]/g, "")
    .replace(/(^|\n)#{1,6}\s+/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return [];

  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = "";

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if ((current + " " + sentence).trim().length <= MAX_TTS_CHUNK) {
      current = (current + " " + sentence).trim();
      continue;
    }

    if (current) chunks.push(current);

    if (sentence.length <= MAX_TTS_CHUNK) {
      current = sentence;
      continue;
    }

    const words = sentence.split(/\s+/);
    let piece = "";
    for (const word of words) {
      if ((piece + " " + word).trim().length > MAX_TTS_CHUNK && piece) {
        chunks.push(piece);
        piece = word;
      } else {
        piece = (piece + " " + word).trim();
      }
    }
    current = piece;
  }

  if (current) chunks.push(current);
  return chunks;
}

function browserSpeech(text: string, options: VoiceOptions): SpeechHandle {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    throw new Error("Dami couldn't play voice on this browser.");
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  // Prefer Ghanaian English for the fallback when the browser exposes it.
  utterance.lang = options.language.startsWith("en") ? "en-GH" : options.language;
  utterance.rate = 0.97;
  utterance.pitch = options.gender === "female" ? 1.04 : 0.97;

  const voices = window.speechSynthesis.getVoices();
  const languagePrefix = utterance.lang.toLowerCase().split("-")[0] ?? "en";
  const matching = voices.filter((voice) => voice.lang.toLowerCase().startsWith(languagePrefix));
  const preferred =
    matching.find((voice) => voice.lang.toLowerCase() === "en-gh" && /female|woman/i.test(voice.name)) ??
    matching.find((voice) => /ghana|twi|akan/i.test(voice.name)) ??
    matching.find((voice) => /africa|african/i.test(voice.name) && !/male/i.test(voice.name)) ??
    matching.find((voice) => !/male/i.test(voice.name)) ??
    matching[0] ??
    voices[0];

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

async function fetchSaharaAudio(text: string, options: VoiceOptions): Promise<{ audio: HTMLAudioElement; url: string } | null> {
  const response = await fetch("/api/sahara/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...options }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    console.warn("Sahara TTS chunk unavailable", response.status, payload.error);
    return null;
  }

  const blob = await response.blob();
  if (blob.size === 0) return null;

  const url = URL.createObjectURL(blob);
  return { audio: new Audio(url), url };
}

export async function speak(text: string, options: VoiceOptions): Promise<SpeechHandle> {
  const chunks = chunkText(text);
  if (chunks.length === 0) return browserSpeech(text, options);

  let stopped = false;
  let activeAudio: HTMLAudioElement | null = null;
  let activeUrl: string | null = null;

  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });

  const finish = () => {
    if (activeAudio) activeAudio.pause();
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    activeAudio = null;
    activeUrl = null;
    resolveEnded();
  };

  void (async () => {
    try {
      let nextAudioPromise = fetchSaharaAudio(chunks[0]!, options);

      for (let i = 0; i < chunks.length && !stopped; i += 1) {
        const prepared = await nextAudioPromise;
        if (stopped) break;

        // Prefetch the following sentence while the current one is speaking.
        if (i + 1 < chunks.length) {
          nextAudioPromise = fetchSaharaAudio(chunks[i + 1]!, options);
        }

        if (!prepared) {
          const fallback = browserSpeech(chunks.slice(i).join(" "), options);
          activeAudio = null;
          activeUrl = null;
          await fallback.ended;
          break;
        }

        activeAudio = prepared.audio;
        activeUrl = prepared.url;

        try {
          await activeAudio.play();
        } catch (error) {
          console.warn("Sahara audio playback was blocked; using Ghanaian browser fallback", error);
          URL.revokeObjectURL(activeUrl);
          activeAudio = null;
          activeUrl = null;
          const fallback = browserSpeech(chunks.slice(i).join(" "), options);
          await fallback.ended;
          break;
        }

        await new Promise<void>((resolve) => {
          const settle = () => resolve();
          activeAudio!.addEventListener("ended", settle, { once: true });
          activeAudio!.addEventListener("error", settle, { once: true });
        });

        if (activeUrl) URL.revokeObjectURL(activeUrl);
        activeAudio = null;
        activeUrl = null;
      }
    } catch (error) {
      console.warn("Sahara TTS request failed; using Ghanaian browser fallback", error);
      if (!stopped) {
        const fallback = browserSpeech(text, options);
        await fallback.ended;
      }
    } finally {
      finish();
    }
  })();

  return {
    stop() {
      stopped = true;
      window.speechSynthesis?.cancel();
      finish();
    },
    ended,
  };
}
