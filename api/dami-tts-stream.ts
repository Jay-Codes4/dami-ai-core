import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const INTRON_TTS_STREAM_URL = "wss://infer.voice.intron.io/tts/v1/stream";
const ALLOWED_ACCENTS = new Set([
  "afrikaans",
  "hausa",
  "igbo",
  "luganda",
  "sepedi",
  "swahili",
  "setswana",
  "xhosa",
  "yoruba",
  "zulu",
  "pidgin",
]);
const ALLOWED_LANGUAGES = new Set(["en", "yo", "sw", "pcm"]);
const ALLOWED_FORMATS = new Set(["wav", "opus"]);

function pick(value: string | null, allowed: Set<string>, fallback: string) {
  const normalised = (value ?? "").toLowerCase().trim();
  return allowed.has(normalised) ? normalised : fallback;
}

function safeClose(socket: WebSocket, code = 1000, reason = "") {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    try {
      socket.close(code, reason.slice(0, 120));
    } catch {
      // Ignore close races.
    }
  }
}

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (client, request) => {
  const apiKey = process.env.INTRON_API_KEY;
  if (!apiKey) {
    client.send(JSON.stringify({ message_type: "PROXY_ERROR", message: "Sahara voice is not configured." }));
    safeClose(client, 1011, "Missing server voice configuration");
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const accent = pick(requestUrl.searchParams.get("voice_accent"), ALLOWED_ACCENTS, "yoruba");
  const language = pick(requestUrl.searchParams.get("voice_language"), ALLOWED_LANGUAGES, "en");
  const format = pick(requestUrl.searchParams.get("output_audio_format"), ALLOWED_FORMATS, "wav");

  const upstreamUrl = new URL(INTRON_TTS_STREAM_URL);
  upstreamUrl.searchParams.set("voice_accent", accent);
  // Dami's product voice is intentionally female. Do not allow stale client
  // settings to silently switch the live voice back to male.
  upstreamUrl.searchParams.set("voice_gender", "female");
  upstreamUrl.searchParams.set("voice_language", language);
  upstreamUrl.searchParams.set("output_audio_format", format);

  const upstream = new WebSocket(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const queued: string[] = [];

  client.on("message", (raw) => {
    const text = raw.toString();
    if (text.length > 2048) {
      client.send(JSON.stringify({ message_type: "PROXY_ERROR", message: "Voice message too large." }));
      return;
    }

    try {
      const parsed = JSON.parse(text) as { message_type?: string; text?: string };
      if (!parsed.message_type || !["INPUT_TEXT_CHUNK", "FETCH_AUDIO_CHUNK", "COMMIT"].includes(parsed.message_type)) {
        client.send(JSON.stringify({ message_type: "PROXY_ERROR", message: "Unsupported voice message." }));
        return;
      }
      if (parsed.message_type === "INPUT_TEXT_CHUNK") {
        const length = parsed.text?.trim().length ?? 0;
        if (length < 10 || length > 100) {
          client.send(JSON.stringify({ message_type: "PROXY_ERROR", message: "Streaming text chunks must be 10-100 characters." }));
          return;
        }
      }
    } catch {
      client.send(JSON.stringify({ message_type: "PROXY_ERROR", message: "Invalid voice message." }));
      return;
    }

    if (upstream.readyState === WebSocket.OPEN) upstream.send(text);
    else if (upstream.readyState === WebSocket.CONNECTING) queued.push(text);
  });

  upstream.on("open", () => {
    for (const message of queued.splice(0)) upstream.send(message);
  });

  upstream.on("message", (data, isBinary) => {
    if (client.readyState !== WebSocket.OPEN) return;
    client.send(data, { binary: isBinary });
  });

  upstream.on("error", (error) => {
    console.error("Sahara streaming TTS upstream error", error);
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ message_type: "PROXY_ERROR", message: "Sahara streaming voice is temporarily unavailable." }));
    }
  });

  upstream.on("close", (code, reason) => {
    safeClose(client, code || 1011, reason.toString() || "Sahara stream closed");
  });

  client.on("close", () => safeClose(upstream, 1000, "Client disconnected"));
  client.on("error", () => safeClose(upstream, 1011, "Client socket error"));
});

export default server;
