const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { WebSocket, WebSocketServer } = require("ws");

const ORIGIN = "https://dami-ai-core.vercel.app";
let mockServer;
let mockPort;
let gatewayPort;
let gatewayProcess;
let gatewayError = "";

function openPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForGateway(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Gateway start timed out: ${gatewayError}`)),
      5000,
    );
    child.stdout.on("data", (data) => {
      if (!data.toString().includes("Dami voice gateway listening")) return;
      clearTimeout(timer);
      resolve();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Gateway exited early (${code}): ${gatewayError}`));
    });
  });
}

before(async () => {
  mockPort = await openPort();
  gatewayPort = await openPort();
  mockServer = http.createServer();
  const mockSockets = new WebSocketServer({ server: mockServer });
  mockSockets.on("connection", (socket, request) => {
    const pathname = new URL(request.url, "http://local").pathname;
    setTimeout(
      () =>
        socket.send(
          JSON.stringify({
            message_type: "SESSION_CREATED",
            configs: { voice_gender: "female" },
          }),
        ),
      20,
    );
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (pathname === "/stt" && message.audio_data !== undefined) {
        socket.send(
          JSON.stringify({ message_type: "PARTIAL_TRANSCRIPT", transcript: "hello Dami" }),
        );
      }
      if (pathname === "/tts" && message.message_type === "INPUT_TEXT_CHUNK") {
        socket.send(JSON.stringify({ message_type: "TEXT_CHUNK_ACK", chunk_id: message.ack_id }));
      }
      if (pathname === "/tts" && message.message_type === "FETCH_AUDIO_CHUNK") {
        socket.send(
          JSON.stringify({
            message_type: "FETCH_AUDIO_CHUNK",
            processing_status: "READY",
            chunk_id: message.chunk_id,
            audio_base_64: Buffer.from("RIFF-test").toString("base64"),
            extension: ".wav",
          }),
        );
      }
      if (pathname === "/tts" && message.message_type === "COMMIT") {
        socket.send(JSON.stringify({ message_type: "COMMITTED_AUDIO", audio_len: 1 }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    mockServer.once("error", reject);
    mockServer.listen(mockPort, "127.0.0.1", resolve);
  });

  gatewayProcess = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
    env: {
      ...process.env,
      PORT: String(gatewayPort),
      INTRON_API_KEY: "integration-test-key",
      ALLOWED_ORIGINS: ORIGIN,
      SAHARA_STT_STREAM_URL: `ws://127.0.0.1:${mockPort}/stt`,
      SAHARA_TTS_STREAM_URL: `ws://127.0.0.1:${mockPort}/tts`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  gatewayProcess.stderr.on("data", (data) => {
    gatewayError += data.toString();
  });
  await waitForGateway(gatewayProcess);
});

after(async () => {
  gatewayProcess?.kill();
  await new Promise((resolve) => mockServer?.close(resolve));
});

test("health advertises both speech transports", async () => {
  const response = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "dami-voice-gateway",
    stt: true,
    tts: true,
  });
});

test("STT waits for Sahara session readiness and forwards transcripts", async () => {
  const transcript = await new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${gatewayPort}/stt?language=en`, {
      origin: ORIGIN,
    });
    const timer = setTimeout(() => reject(new Error("STT probe timed out")), 3000);
    socket.on("open", () => socket.send(JSON.stringify({ audio_data: "AA==" })));
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.message_type !== "PARTIAL_TRANSCRIPT") return;
      clearTimeout(timer);
      socket.close();
      resolve(message.transcript);
    });
    socket.on("error", reject);
  });
  assert.equal(transcript, "hello Dami");
});

test("TTS forwards the official chunk and audio-fetch protocol", async () => {
  const audio = await new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${gatewayPort}/tts?voice_accent=yoruba&voice_language=en&output_audio_format=wav`,
      { origin: ORIGIN },
    );
    const timer = setTimeout(() => reject(new Error("TTS probe timed out")), 3000);
    socket.on("open", () =>
      socket.send(
        JSON.stringify({
          message_type: "INPUT_TEXT_CHUNK",
          text: "Dami voice check.",
          ack_id: 1,
        }),
      ),
    );
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.message_type === "TEXT_CHUNK_ACK") {
        socket.send(JSON.stringify({ message_type: "FETCH_AUDIO_CHUNK", chunk_id: 1 }));
      }
      if (message.message_type === "FETCH_AUDIO_CHUNK" && message.audio_base_64) {
        clearTimeout(timer);
        socket.send(JSON.stringify({ message_type: "COMMIT" }));
        socket.close();
        resolve(Buffer.from(message.audio_base_64, "base64").toString());
      }
    });
    socket.on("error", reject);
  });
  assert.equal(audio, "RIFF-test");
});
