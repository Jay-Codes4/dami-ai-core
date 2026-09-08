type Body = { audioBase64?: string; sampleRate?: number; language?: string; codeSwitching?: boolean };
type SaharaData = { file_id?: string; processing_status?: string; audio_transcript?: string; transcript?: string };
type SaharaPayload = { data?: SaharaData; message?: string; error?: string; detail?: string };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44); const view = new DataView(header);
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcm.byteLength, true);
  const wav = new Uint8Array(44 + pcm.byteLength); wav.set(new Uint8Array(header), 0); wav.set(pcm, 44); return wav;
}

async function parse(response: Response) {
  const raw = await response.text(); let payload: SaharaPayload | null = null;
  try { payload = raw ? JSON.parse(raw) as SaharaPayload : null; } catch { payload = null; }
  return { response, raw, payload };
}

async function queueSahara(wav: Uint8Array, language: string, key: string) {
  const fileName = `dami-${Date.now()}.wav`; const form = new FormData();
  form.set("audio_file_name", fileName); form.set("audio_file_blob", new Blob([wav], { type: "audio/wav" }), fileName);
  form.set("use_category", "file_category_legal"); form.set("use_language_asr_input", language || "en"); form.set("use_disable_llm_corrections", "TRUE");
  return parse(await fetch("https://infer.voice.intron.io/file/v1/upload", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form }));
}

async function status(fileId: string, key: string) {
  return parse(await fetch(`https://infer.voice.intron.io/file/v1/status/${encodeURIComponent(fileId)}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" }));
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const key = process.env.INTRON_API_KEY;
  if (!key) return json({ error: "Sahara is not connected on the server. INTRON_API_KEY is missing.", code: "not_configured" }, 503);
  let body: Body; try { body = await request.json() as Body; } catch { return json({ error: "Invalid request body." }, 400); }
  const sampleRate = body.sampleRate ?? 16000;
  if (!body.audioBase64 || sampleRate < 8000 || sampleRate > 48000) return json({ error: "That recording could not be read. Please try again." }, 400);
  const pcm = new Uint8Array(Buffer.from(body.audioBase64, "base64"));
  if (pcm.byteLength < 3200) return json({ error: "Dami did not receive enough audio. Speak for a moment and try again." }, 422);

  const started = Date.now(); const wav = pcm16ToWav(pcm, sampleRate);
  let queued = await queueSahara(wav, body.language || "en", key);
  if (!queued.response.ok && body.language && body.language !== "en" && queued.response.status === 400) queued = await queueSahara(wav, "en", key);
  if (!queued.response.ok) {
    const upstream = queued.payload?.message ?? queued.payload?.error ?? queued.payload?.detail ?? queued.raw.slice(0, 220);
    return json({ error: upstream || `Sahara could not queue transcription (HTTP ${queued.response.status}).` }, 502);
  }
  const fileId = queued.payload?.data?.file_id;
  if (!fileId) return json({ error: "Sahara accepted the recording but did not return a transcription ID." }, 502);

  // Poll quickly. This avoids the synchronous endpoint that can sit until an upstream timeout.
  const delays = [150, 200, 250, 350, 500, 700, 900, 1200, 1500, 1800, 2200, 2600];
  for (const delay of delays) {
    await wait(delay);
    const current = await status(fileId, key);
    if (!current.response.ok) {
      if (current.response.status === 429) continue;
      const detail = current.payload?.message ?? current.payload?.error ?? current.raw.slice(0, 180);
      return json({ error: detail || "Sahara could not check the transcription." }, 502);
    }
    const state = current.payload?.data?.processing_status;
    const text = current.payload?.data?.audio_transcript ?? current.payload?.data?.transcript ?? "";
    if (state === "FILE_TRANSCRIBED" || text.trim()) {
      if (!text.trim()) return json({ error: "Dami received the recording but no speech was detected." }, 422);
      return json({ text: text.trim(), requestId: fileId, durationMs: Date.now() - started });
    }
    if (state === "FILE_PROCESSING_FAILED") return json({ error: "Sahara could not process that recording. Please try again." }, 502);
  }
  return json({ error: "Sahara is taking unusually long to transcribe right now. Please try again.", requestId: fileId }, 504);
}
