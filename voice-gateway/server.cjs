const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 8787);
const INTRON_API_KEY = process.env.INTRON_API_KEY;
const SAHARA_STT_STREAM_URL =
  process.env.SAHARA_STT_STREAM_URL || "wss://infer.voice.intron.io/stt/v1/stream";
const SAHARA_TTS_STREAM_URL =
  process.env.SAHARA_TTS_STREAM_URL || "wss://infer.voice.intron.io/tts/v1/stream";
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "https://dami-ai-core.vercel.app")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const TTS_ACCENTS = new Set([
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
const TTS_LANGUAGES = new Set(["en", "yo", "sw", "pcm"]);
const TTS_FORMATS = new Set(["wav", "opus"]);
const TERMINAL_MESSAGES = new Set([
  "AUTHENTICATION_ERROR",
  "RESOURCE_EXHAUSTED",
  "QUOTA_EXCEEDED",
  "SESSION_TIME_LIMIT_EXCEEDED",
  "INSUFFICIENT_TEXT_ACTIVITY",
  "CHUNK_ID_MISMATCH_WITH_TOTAL",
  "CHUNK_SIZE_TOO_SMALL",
  "CHUNK_SIZE_TOO_LARGE",
  "ERROR",
]);

if (!INTRON_API_KEY) {
  console.error("INTRON_API_KEY is required");
  process.exit(1);
}

function originAllowed(request) {
  const origin = request.headers.origin || "";
  return !ALLOWED_ORIGINS.size || ALLOWED_ORIGINS.has(origin);
}

function pick(value, allowed, fallback) {
  const normalised = String(value || "")
    .toLowerCase()
    .trim();
  return allowed.has(normalised) ? normalised : fallback;
}

function closeUpstream(upstream, code = 1000) {
  if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
    upstream.close(code);
  }
}

function rejectUpgrade(socket) {
  socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
  socket.destroy();
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({ ok: true, service: "dami-voice-gateway", stt: true, tts: true }),
    );
  }
  res.writeHead(404).end();
});

const sttWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
const ttsWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)
    .pathname;
  const target = pathname === "/stt" ? sttWss : pathname === "/tts" ? ttsWss : null;
  if (!target) return rejectUpgrade(socket);
  target.handleUpgrade(request, socket, head, (client) => {
    target.emit("connection", client, request);
  });
});

sttWss.on("connection", (client, request) => {
  if (!originAllowed(request)) {
    client.close(1008, "Origin not allowed");
    return;
  }

  const incoming = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const requestedLanguage =
    (incoming.searchParams.get("language") || "en").replace(/[^a-z-]/gi, "").slice(0, 12) || "en";
  // Sahara documents "en" for English streaming. UI locales such as en-NG
  // are not ASR language codes.
  const language = requestedLanguage.toLowerCase().startsWith("en-") ? "en" : requestedLanguage;
  const upstreamUrl = new URL(SAHARA_STT_STREAM_URL);
  upstreamUrl.searchParams.set("sample_rate", "16000");
  upstreamUrl.searchParams.set("bit_rate", "16");
  upstreamUrl.searchParams.set("num_channels", "1");
  upstreamUrl.searchParams.set("use_language_asr_input", language);
  const upstream = new WebSocket(upstreamUrl, {
    headers: { Authorization: `Bearer ${INTRON_API_KEY}` },
    perMessageDeflate: false,
    followRedirects: true,
  });

  // Sahara only accepts audio after SESSION_CREATED confirms auth, quota and
  // capacity. Queue browser messages until that event, then flush in order.
  let sessionReady = false;
  let terminal = false;
  const pending = [];

  const sendUpstream = (data) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: false, fin: true });
  };
  const forward = (data) => {
    if (sessionReady && upstream.readyState === WebSocket.OPEN) sendUpstream(data);
    else if (!terminal) pending.push(data);
  };
  const failClient = (message) => {
    terminal = true;
    pending.length = 0;
    if (client.readyState === WebSocket.OPEN)
      client.send(JSON.stringify({ message_type: "GATEWAY_ERROR", message }), {
        binary: false,
        fin: true,
      });
    closeUpstream(upstream, 1011);
  };

  upstream.on("open", () =>
    console.log(`Sahara STT transport open (${language}); awaiting SESSION_CREATED`),
  );
  upstream.on("message", (data) => {
    const text = data.toString();
    let messageType = "";
    try {
      messageType = JSON.parse(text)?.message_type || "";
    } catch {}

    if (messageType === "SESSION_CREATED") {
      sessionReady = true;
      console.log(`Sahara STT ready (${language}); flushing ${pending.length} messages`);
      while (pending.length && upstream.readyState === WebSocket.OPEN && !terminal)
        sendUpstream(pending.shift());
    }
    if (TERMINAL_MESSAGES.has(messageType)) {
      console.error(`Sahara STT terminal message: ${text.slice(0, 500)}`);
      terminal = true;
      pending.length = 0;
    }
    if (client.readyState === WebSocket.OPEN) client.send(text, { binary: false, fin: true });
  });
  upstream.on("unexpected-response", (_request, response) => {
    console.error(`Sahara STT handshake rejected: HTTP ${response.statusCode}`);
    failClient(`Sahara rejected the live connection (HTTP ${response.statusCode}).`);
  });
  upstream.on("error", (error) => {
    console.error("Sahara STT websocket error:", error.message);
    failClient("Dami could not connect to Sahara streaming.");
  });
  upstream.on("close", (code, reason) => {
    console.log(
      `Sahara STT closed: ${code} ${reason.toString().slice(0, 120)}; sessionReady=${sessionReady}`,
    );
    if (!sessionReady && !terminal)
      failClient("Sahara closed the live session before it was ready.");
    if (client.readyState === WebSocket.OPEN)
      client.close(code === 1000 ? 1000 : 1011, reason.toString().slice(0, 100));
  });

  client.on("message", (data) => forward(data.toString()));
  client.on("close", () => {
    terminal = true;
    closeUpstream(upstream);
  });
  client.on("error", () => {
    terminal = true;
    closeUpstream(upstream, 1011);
  });
});

ttsWss.on("connection", (client, request) => {
  if (!originAllowed(request)) {
    client.close(1008, "Origin not allowed");
    return;
  }

  const incoming = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const accent = pick(incoming.searchParams.get("voice_accent"), TTS_ACCENTS, "yoruba");
  const language = pick(incoming.searchParams.get("voice_language"), TTS_LANGUAGES, "en");
  const format = pick(incoming.searchParams.get("output_audio_format"), TTS_FORMATS, "wav");
  const upstreamUrl = new URL(SAHARA_TTS_STREAM_URL);
  upstreamUrl.searchParams.set("voice_accent", accent);
  upstreamUrl.searchParams.set("voice_gender", "female");
  upstreamUrl.searchParams.set("voice_language", language);
  upstreamUrl.searchParams.set("output_audio_format", format);

  const upstream = new WebSocket(upstreamUrl, {
    headers: { Authorization: `Bearer ${INTRON_API_KEY}` },
    perMessageDeflate: false,
    followRedirects: true,
  });
  let sessionReady = false;
  let terminal = false;
  const pending = [];

  const failClient = (message) => {
    terminal = true;
    pending.length = 0;
    if (client.readyState === WebSocket.OPEN)
      client.send(JSON.stringify({ message_type: "GATEWAY_ERROR", message }));
    closeUpstream(upstream, 1011);
  };
  const forward = (text) => {
    if (sessionReady && upstream.readyState === WebSocket.OPEN) upstream.send(text);
    else if (!terminal) pending.push(text);
  };

  client.on("message", (raw) => {
    const text = raw.toString();
    if (text.length > 2048) {
      failClient("Voice message too large.");
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const supported = new Set(["INPUT_TEXT_CHUNK", "FETCH_AUDIO_CHUNK", "COMMIT"]);
      if (!supported.has(parsed.message_type)) throw new Error("Unsupported voice message.");
      if (parsed.message_type === "INPUT_TEXT_CHUNK") {
        const length = String(parsed.text || "").trim().length;
        if (length < 10 || length > 100)
          throw new Error("Streaming text chunks must be 10-100 characters.");
      }
    } catch (error) {
      failClient(error instanceof Error ? error.message : "Invalid voice message.");
      return;
    }
    forward(text);
  });

  upstream.on("open", () =>
    console.log(`Sahara TTS transport open (${language}/${accent}); awaiting SESSION_CREATED`),
  );
  upstream.on("message", (data) => {
    const text = data.toString();
    let messageType = "";
    try {
      messageType = JSON.parse(text)?.message_type || "";
    } catch {}
    if (messageType === "SESSION_CREATED") {
      sessionReady = true;
      console.log(`Sahara TTS ready (${language}/${accent}); flushing ${pending.length} messages`);
      while (pending.length && upstream.readyState === WebSocket.OPEN && !terminal)
        upstream.send(pending.shift());
    }
    if (TERMINAL_MESSAGES.has(messageType) || messageType === "INPUT_ERROR") {
      console.error(`Sahara TTS terminal message: ${text.slice(0, 500)}`);
      terminal = true;
      pending.length = 0;
    }
    if (client.readyState === WebSocket.OPEN) client.send(text);
  });
  upstream.on("unexpected-response", (_request, response) => {
    console.error(`Sahara TTS handshake rejected: HTTP ${response.statusCode}`);
    failClient(`Sahara rejected live voice (HTTP ${response.statusCode}).`);
  });
  upstream.on("error", (error) => {
    console.error("Sahara TTS websocket error:", error.message);
    failClient("Dami could not connect to Sahara streaming voice.");
  });
  upstream.on("close", (code, reason) => {
    if (!sessionReady && !terminal)
      failClient("Sahara closed the live voice session before it was ready.");
    if (client.readyState === WebSocket.OPEN)
      client.close(code === 1000 ? 1000 : 1011, reason.toString().slice(0, 100));
  });
  client.on("close", () => {
    terminal = true;
    closeUpstream(upstream);
  });
  client.on("error", () => {
    terminal = true;
    closeUpstream(upstream, 1011);
  });
});

server.listen(PORT, "0.0.0.0", () =>
  console.log(`Dami voice gateway listening on ${PORT} (STT + TTS)`),
);
