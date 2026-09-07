/**
 * Browser side of Sahara text-to-speech. Requests audio from the server route
 * and plays it. Returns a handle so the UI can stop playback.
 */

export interface SpeechHandle {
  stop(): void;
  ended: Promise<void>;
}

export async function speak(
  text: string,
  options: { accent: string; gender: string; language: string },
): Promise<SpeechHandle> {
  const response = await fetch("/api/sahara/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...options }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? "Dami couldn't read that answer aloud.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  const ended = new Promise<void>((resolve) => {
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
      resolve();
    });
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      resolve();
    });
  });

  await audio.play();

  return {
    stop() {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(url);
    },
    ended,
  };
}
