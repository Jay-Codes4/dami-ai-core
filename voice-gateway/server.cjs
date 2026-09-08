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

const wss = new WebSocketServer({ server, path: '/stt', perMessageDeflate: false });

wss.on('connection', (client, request) => {
  const origin = request.headers.origin || '';
  if (ALLOWED_ORIGINS.size && !ALLOWED_ORIGINS.has(origin)) {
    client.close(1008, 'Origin not allowed');
    return;
  }

  const incoming = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const requestedLanguage = (incoming.searchParams.get('language') || 'en').replace(/[^a-z-]/gi, '').slice(0, 12) || 'en';
  // Sahara documents "en" for English streaming. UI locales such as en-NG are not ASR language codes.
  const language = requestedLanguage.toLowerCase().startsWith('en-') ? 'en' : requestedLanguage;
  const upstreamUrl = `wss://infer.voice.intron.io/stt/v1/stream?sample_rate=16000&bit_rate=16&num_channels=1&use_language_asr_input=${encodeURIComponent(language)}`;
  const upstream = new WebSocket(upstreamUrl, {
    headers: { Authorization: `Bearer ${INTRON_API_KEY}` },
    perMessageDeflate: false,
    followRedirects: true,
  });

  // Do not send audio merely because the TCP/WebSocket handshake is open. Sahara's
  // documented protocol starts with SESSION_CREATED after auth/quota/capacity checks.
  // Queue browser messages until that event arrives, then flush them in order.
  let sessionReady = false;
  let terminal = false;
  const pending = [];

  const sendUpstream = data => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: false, fin: true });
  };
  const forward = data => {
    if (sessionReady && upstream.readyState === WebSocket.OPEN) sendUpstream(data);
    else if (!terminal) pending.push(data);
  };
  const failClient = message => {
    terminal = true;
    pending.length = 0;
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ message_type: 'GATEWAY_ERROR', message }), { binary: false, fin: true });
  };

  upstream.on('open', () => console.log(`Sahara websocket transport open (${language}); awaiting SESSION_CREATED`));

  upstream.on('message', (data, isBinary) => {
    const text = isBinary ? data.toString() : data.toString();
    let messageType = '';
    try { messageType = JSON.parse(text)?.message_type || ''; } catch {}

    if (messageType === 'SESSION_CREATED') {
      sessionReady = true;
      console.log(`Sahara SESSION_CREATED (${language}); flushing ${pending.length} queued messages`);
      while (pending.length && upstream.readyState === WebSocket.OPEN && !terminal) sendUpstream(pending.shift());
    }

    if (['AUTHENTICATION_ERROR','RESOURCE_EXHAUSTED','QUOTA_EXCEEDED','ERROR'].includes(messageType)) {
      console.error(`Sahara terminal message: ${text.slice(0, 500)}`);
      terminal = true;
      pending.length = 0;
    }

    if (client.readyState === WebSocket.OPEN) client.send(text, { binary: false, fin: true });
  });

  upstream.on('unexpected-response', (_request, response) => {
    console.error(`Sahara websocket handshake rejected: HTTP ${response.statusCode}`);
    failClient(`Sahara rejected the live connection (HTTP ${response.statusCode}).`);
  });
  upstream.on('error', err => {
    console.error('Sahara websocket error:', err.message);
    failClient('Dami could not connect to Sahara streaming.');
  });
  upstream.on('close', (code, reason) => {
    console.log(`Sahara websocket closed: ${code} ${reason.toString().slice(0, 120)}; sessionReady=${sessionReady}`);
    if (!sessionReady && !terminal) failClient('Sahara closed the live session before it was ready.');
    if (client.readyState === WebSocket.OPEN) client.close(code === 1000 ? 1000 : 1011, reason.toString().slice(0, 100));
  });

  client.on('message', data => forward(data.toString()));
  client.on('close', () => { terminal = true; if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close(1000); });
  client.on('error', () => { terminal = true; if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close(1011); });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Dami voice gateway listening on ${PORT}`));
