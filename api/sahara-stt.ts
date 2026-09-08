type Body = {
  audioBase64?: string;
  sampleRate?: number;
  language?: string;
  codeSwitching?: boolean;
};

type SaharaPayload = {
  data?: { file_id?: string; audio_transcript?: string; transcript?: string };
  message?: string;
  error?: string;
  detail?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  const wav = new Uint8Array(44 + pcm.byteLength);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  return wav;
}

async function callSahara(wav: Uint8Array, language: string, key: string) {
  const fileName = `dami-${Date.now()}.wav`;
  const form = new FormData();
  form.set("audio_file_name", fileName);
  form.set("audio_file_blob", new Blob([wav], { type: "audio/wav" }), fileName);
  form.set("use_category", "file_category_legal");
  form.set("use_language_asr_input", language || "en");
  form.set("use_disable_llm_corrections", "TRUE");

  const response = await fetch(
    process.env.SAHARA_STT_SYNC_URL ?? "https://infer.voice.intron.io/file/v1/upload/sync",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    },
  );

  const raw = await response.text();
  let payload: SaharaPayload | null = null;
  try {
    payload = raw ? (JSON.parse(raw) as SaharaPayload) : null;
  } catch {
    payload = null;
  }
  return { response, raw, payload };
}

export default async function handler(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const key = process.env.INTRON_API_KEY;
  if (!key) return json({ error: "Sahara is not connected on the server. INTRON_API_KEY is missing.", code: "not_configured" }, 503);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const sampleRate = body.sampleRate ?? 16000;
  if (!body.audioBase64 || sampleRate < 8000 || sampleRate > 48000) {
    return json({ error: "That recording could not be read. Please try again." }, 400);
  }

  const pcm = new Uint8Array(Buffer.from(body.audioBase64, "base64"));
  if (pcm.byteLength < 3200) return json({ error: "Dami did not receive enough audio. Speak for a moment and try again." }, 422);

  const started = Date.now();
  const wav = pcm16ToWav(pcm, sampleRate);
  let attempt = await callSahara(wav, body.language || "en", key);
  if (!attempt.response.ok && body.language && body.language !== "en" && attempt.response.status === 400) {
    attempt = await callSahara(wav, "en", key);
  }

  if (!attempt.response.ok) {
    const upstream = attempt.payload?.message ?? attempt.payload?.error ?? attempt.payload?.detail ?? attempt.raw.slice(0, 220);
    console.error("Sahara STT rejected recording", { status: attempt.response.status, upstream });
    return json({ error: upstream || `Sahara transcription failed (HTTP ${attempt.response.status}).` }, 502);
  }

  const text = attempt.payload?.data?.audio_transcript ?? attempt.payload?.data?.transcript ?? "";
  if (!text.trim()) return json({ error: "Dami received the recording but Sahara returned no transcript." }, 422);

  return json({
    text: text.trim(),
    requestId: attempt.payload?.data?.file_id ?? null,
    durationMs: Date.now() - started,
  });
}
