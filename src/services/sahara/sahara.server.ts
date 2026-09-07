/**
 * Intron Sahara integration — SERVER ONLY.
 *
 * The Sahara credential (INTRON_API_KEY) never leaves the server. The browser
 * talks to `/api/sahara/stt` and `/api/sahara/tts`, which own the credential
 * and the WebSocket sessions documented at:
 *   STT: wss://infer.voice.intron.io/stt/v1/stream
 *   TTS: wss://infer.voice.intron.io/tts/v1/stream
 *
 * If the credential is absent, every entry point fails loudly with a clear
 * message. Dami never returns invented transcripts or synthetic audio.
 */

export const SAHARA_STT_URL =
  process.env["SAHARA_STT_URL"] ?? "wss://infer.voice.intron.io/stt/v1/stream";
export const SAHARA_TTS_URL =
  process.env["SAHARA_TTS_URL"] ?? "wss://infer.voice.intron.io/tts/v1/stream";

/** Documented Sahara session limit. */
export const SAHARA_MAX_SESSION_SECONDS = 300;

export class SaharaNotConfiguredError extends Error {
  constructor() {
    super(
      "Sahara isn't connected yet. Add INTRON_API_KEY on the server to enable speech-to-text and text-to-speech.",
    );
    this.name = "SaharaNotConfiguredError";
  }
}

export class SaharaRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaharaRequestError";
  }
}

export function getSaharaKey(): string {
  const key = process.env["INTRON_API_KEY"];
  if (!key) throw new SaharaNotConfiguredError();
  return key;
}

export function isSaharaConfigured(): boolean {
  return Boolean(process.env["INTRON_API_KEY"]);
}

type WorkerSocketResponse = Response & { webSocket?: WebSocket };

/**
 * Opens an authenticated WebSocket to Sahara from the server runtime.
 * Uses the Upgrade-over-fetch handshake supported by the edge runtime, which
 * is the only way to attach an Authorization header to a WS connection.
 */
export async function openSaharaSocket(url: string): Promise<WebSocket> {
  const key = getSaharaKey();
  const response = (await fetch(url.replace(/^ws/, "http"), {
    headers: {
      Upgrade: "websocket",
      Authorization: `Bearer ${key}`,
    },
  })) as WorkerSocketResponse;

  const socket = response.webSocket;
  if (!socket) {
    throw new SaharaRequestError(
      `Sahara refused the connection (status ${response.status}). Check the API key and endpoint.`,
    );
  }
  socket.accept();
  return socket;
}

function parse(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface SttRequest {
  /** Base64-encoded 16 kHz mono PCM16 audio. */
  audioBase64: string;
  sampleRate: number;
  language: string;
  codeSwitching: boolean;
}

export interface SttResult {
  text: string;
  requestId: string | null;
  durationMs: number;
}

/** Streams one recording to Sahara STT and resolves with the committed transcript. */
export async function transcribe(request: SttRequest): Promise<SttResult> {
  const started = Date.now();
  const socket = await openSaharaSocket(SAHARA_STT_URL);

  return await new Promise<SttResult>((resolve, reject) => {
    let requestId: string | null = null;
    let finalText = "";
    let lastPartial = "";

    const timeout = setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      reject(new SaharaRequestError("Sahara took too long to return a transcript."));
    }, SAHARA_MAX_SESSION_SECONDS * 1000);

    const finish = (text: string) => {
      clearTimeout(timeout);
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      resolve({ text: text.trim(), requestId, durationMs: Date.now() - started });
    };

    socket.addEventListener("message", (event: MessageEvent) => {
      const payload = parse(event.data);
      if (!payload) return;
      if (typeof payload["request_id"] === "string") requestId = payload["request_id"];

      const type = String(payload["type"] ?? payload["event"] ?? "");
      const text = String(payload["text"] ?? payload["transcript"] ?? "");

      if (type.includes("error")) {
        clearTimeout(timeout);
        reject(new SaharaRequestError(String(payload["message"] ?? "Sahara returned an error.")));
        return;
      }
      if (type.includes("final") || type.includes("commit") || payload["is_final"] === true) {
        finalText = text || lastPartial;
        finish(finalText);
        return;
      }
      if (text) lastPartial = text;
    });

    socket.addEventListener("close", () => {
      clearTimeout(timeout);
      if (finalText || lastPartial) finish(finalText || lastPartial);
      else reject(new SaharaRequestError("Sahara closed the session without a transcript."));
    });

    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new SaharaRequestError("The connection to Sahara failed."));
    });

    socket.send(
      JSON.stringify({
        type: "start",
        encoding: "pcm16",
        sample_rate: request.sampleRate,
        language: request.language,
        code_switching: request.codeSwitching,
      }),
    );
    socket.send(JSON.stringify({ type: "audio", audio: request.audioBase64 }));
    socket.send(JSON.stringify({ type: "COMMIT" }));
  });
}

export interface TtsRequest {
  text: string;
  accent: string;
  gender: string;
  language: string;
}

/** Streams answer text to Sahara TTS and resolves with the complete audio. */
export async function synthesize(request: TtsRequest): Promise<{ audio: Uint8Array; mime: string }> {
  const socket = await openSaharaSocket(SAHARA_TTS_URL);

  return await new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let mime = "audio/mpeg";

    const timeout = setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      reject(new SaharaRequestError("Sahara took too long to return audio."));
    }, 120_000);

    const finish = () => {
      clearTimeout(timeout);
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      if (total === 0) {
        reject(new SaharaRequestError("Sahara returned no audio for this answer."));
        return;
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve({ audio: merged, mime });
    };

    socket.addEventListener("message", (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        chunks.push(new Uint8Array(event.data));
        return;
      }
      const payload = parse(event.data);
      if (!payload) return;
      if (typeof payload["mime"] === "string") mime = payload["mime"];
      const type = String(payload["type"] ?? payload["event"] ?? "");
      if (type.includes("error")) {
        clearTimeout(timeout);
        reject(new SaharaRequestError(String(payload["message"] ?? "Sahara returned an error.")));
        return;
      }
      if (typeof payload["audio"] === "string") {
        const binary = atob(payload["audio"]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        chunks.push(bytes);
      }
      if (type.includes("done") || type.includes("complete") || type.includes("final")) finish();
    });

    socket.addEventListener("close", finish);
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new SaharaRequestError("The connection to Sahara failed."));
    });

    socket.send(
      JSON.stringify({
        type: "start",
        voice_accent: request.accent,
        voice_gender: request.gender,
        language: request.language,
        output_format: "mp3",
      }),
    );
    socket.send(JSON.stringify({ type: "text", text: request.text }));
    socket.send(JSON.stringify({ type: "COMMIT" }));
  });
}
