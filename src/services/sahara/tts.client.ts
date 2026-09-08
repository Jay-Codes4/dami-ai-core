/**
 * Browser side of Dami text-to-speech.
 *
 * Sahara TTS is always the primary voice path. If Sahara is temporarily
 * unavailable, returns unusable audio, or browser autoplay blocks the returned
 * file, Dami falls back to the browser's speech synthesis so a voice-first
 * interaction never silently becomes text-only.
 */

export interface SpeechHandle {
  stop(): void;
  ended: Promise<void>;
}

function browserSpeech(
  text: string,
  options: { accent: string; gender: string; language: string },
): SpeechHandle {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    throw new Error("Dami couldn't play voice on this browser.");
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.language || "en-NG";
  utterance.rate = 0.96;
  utterance.pitch = options.gender === "female" ? 1.03 : 0.96;

  const voices = window.speechSynthesis.getVoices();
  const languagePrefix = utterance.lang.toLowerCase().split("-")[0];
  const matching = voices.filter((voice) => voice.lang.toLowerCase().startsWith(languagePrefix ?? "en"));
  const preferred =
    matching.find((voice) => {
      const name = voice.name.toLowerCase();
      const accent = options.accent.toLowerCase();
      return name.includes(accent) || name.includes("africa") || name.includes("nigeria") || name.includes("ghana");
    }) ?? matching[0] ?? voices[0];

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

export async function speak(
  text: string,
  options: { accent: string; gender: string; language: string },
): Promise<SpeechHandle> {
  try {
    const response = await fetch("/api/sahara/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...options }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      console.warn("Sahara TTS unavailable; using browser voice fallback", response.status, payload.error);
      return browserSpeech(text, options);
    }

    const blob = await response.blob();
    if (blob.size === 0) {
      console.warn("Sahara TTS returned empty audio; using browser voice fallback");
      return browserSpeech(text, options);
    }

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    let resolveEnded!: () => void;
    const ended = new Promise<void>((resolve) => {
      resolveEnded = resolve;
    });

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolveEnded();
    };

    audio.addEventListener("ended", settle);
    audio.addEventListener("error", settle);

    try {
      await audio.play();
    } catch (error) {
      console.warn("Sahara audio playback was blocked; using browser voice fallback", error);
      audio.pause();
      settle();
      return browserSpeech(text, options);
    }

    return {
      stop() {
        audio.pause();
        audio.currentTime = 0;
        settle();
      },
      ended,
    };
  } catch (error) {
    console.warn("Sahara TTS request failed; using browser voice fallback", error);
    return browserSpeech(text, options);
  }
}
