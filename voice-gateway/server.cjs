const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 8787);
const INTRON_API_KEY = process.env.INTRON_API_KEY;
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || 'https://dami-ai-core.vercel.app').split(',').map(v => v.trim()).filter(Boolean));

if (!INTRON_API_KEY) {
  console.error('INTRON_API_KEY is required');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'dami-voice-gateway' }));
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: '/stt' });

wss.on('connection', (client, request) => {
  const origin = request.headers.origin || '';
  if (ALLOWED_ORIGINS.size && !ALLOWED_ORIGINS.has(origin)) {
    client.close(1008, 'Origin not allowed');
    return;
  }

  const incoming = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const language = (incoming.searchParams.get('language') || 'en').replace(/[^a-z-]/gi, '').slice(0, 12) || 'en';
  const upstreamUrl = `wss://infer.voice.intron.io/stt/v1/stream?sample_rate=16000&bit_rate=16&num_channels=1&use_language_asr_input=${encodeURIComponent(language)}`;
  const upstream = new WebSocket(upstreamUrl, { headers: { Authorization: `Bearer ${INTRON_API_KEY}` } });
  let upstreamReady = false;
  const pending = [];

  const forward = (data) => {
    if (upstreamReady && upstream.readyState === WebSocket.OPEN) upstream.send(data);
    else pending.push(data);
  };

  upstream.on('open', () => {
    upstreamReady = true;
    while (pending.length && upstream.readyState === WebSocket.OPEN) upstream.send(pending.shift());
  });
  upstream.on('message', data => {
    if (client.readyState === WebSocket.OPEN) client.send(data.toString());
  });
  upstream.on('error', err => {
    console.error('Sahara websocket error:', err.message);
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ message_type: 'GATEWAY_ERROR', message: 'Dami could not connect to Sahara streaming.' }));
  });
  upstream.on('close', (code, reason) => {
    if (client.readyState === WebSocket.OPEN) client.close(code === 1000 ? 1000 : 1011, reason.toString().slice(0, 100));
  });

  client.on('message', data => forward(data.toString()));
  client.on('close', () => { if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close(1000); });
  client.on('error', () => { if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close(1011); });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Dami voice gateway listening on ${PORT}`));
