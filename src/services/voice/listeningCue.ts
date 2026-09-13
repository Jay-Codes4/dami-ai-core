/** Lightweight generated listening cue shared by web, mobile and desktop renderer. */
let lastPlayedAt = 0;

async function playCue(direction: "up" | "down") {
  if (typeof window === "undefined") return;
  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  if (ctx.state === "suspended") await ctx.resume();
  const start = ctx.currentTime + 0.01;
  const bubble = (when: number, fromHz: number, toHz: number, volume: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(fromHz, when);
    osc.frequency.exponentialRampToValueAtTime(toHz, when + 0.09);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(volume, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.14);
  };

  if (direction === "up") {
    bubble(start, 430, 650, 0.11);
    bubble(start + 0.085, 610, 880, 0.075);
  } else {
    bubble(start, 820, 610, 0.085);
    bubble(start + 0.075, 590, 390, 0.065);
  }
  window.setTimeout(() => void ctx.close().catch(() => undefined), 450);
}

export async function playListeningCue() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastPlayedAt < 500) return;
  lastPlayedAt = now;

  try {
    await playCue("up");
  } catch {
    // The cue is enhancement only; audio-policy failures must never block listening.
  }
}

export async function playListeningEndCue() {
  if (typeof window === "undefined") return;
  try {
    await playCue("down");
  } catch {
    // Ending feedback must never delay transcription.
  }
}
