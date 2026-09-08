type SaharaData = { file_id?: string; processing_status?: string; audio_transcript?: string; transcript?: string };
type SaharaPayload = { data?: SaharaData; message?: string; error?: string; detail?: string };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function parse(response: Response) {
  const raw = await response.text();
  let payload: SaharaPayload | null = null;
  try { payload = raw ? JSON.parse(raw) as SaharaPayload : null; } catch { payload = null; }
  return { response, raw, payload };
}

async function queueSahara(audio: Blob, fileName: string, language: string, key: string) {
  const form = new FormData();
  form.set("audio_file_name", fileName);
  form.set("audio_file_blob", audio, fileName);
  form.set("use_language_asr_input", language || "en");
  // Dami only needs raw ASR here. Legal reasoning happens in Dami's own agent.
  // Omitting category/post-processing avoids making a short voice question wait
  // behind transcript enrichment work.
  form.set("use_disable_llm_corrections", "TRUE");
  return parse(await fetch("https://infer.voice.intron.io/file/v1/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  }));
}

async function status(fileId: string, key: string) {
  return parse(await fetch(`https://infer.voice.intron.io/file/v1/status/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  }));
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(request: Request) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const key = process.env.INTRON_API_KEY;
  if (!key) return json({ error: "Sahara is not connected on the server.", code: "not_configured" }, 503);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ error: "That recording could not be read. Please try again." }, 400); }

  const audio = form.get("audio");
  const language = String(form.get("language") ?? "en");
  if (!(audio instanceof Blob) || audio.size < 800) {
    return json({ error: "Dami did not receive enough audio. Speak for a moment and try again." }, 422);
  }

  const originalName = audio instanceof File && audio.name ? audio.name : "dami.webm";
  const started = Date.now();
  let queued = await queueSahara(audio, originalName, language, key);
  if (!queued.response.ok && language !== "en" && queued.response.status === 400) {
    queued = await queueSahara(audio, originalName, "en", key);
  }
  if (!queued.response.ok) {
    const upstream = queued.payload?.message ?? queued.payload?.error ?? queued.payload?.detail ?? queued.raw.slice(0, 220);
    return json({ error: upstream || `Sahara could not queue transcription (HTTP ${queued.response.status}).` }, 502);
  }

  const fileId = queued.payload?.data?.file_id;
  if (!fileId) return json({ error: "Sahara accepted the recording but did not return a transcription ID." }, 502);

  // Short questions should normally finish quickly. We poll for a bounded period;
  // the browser's live transcript can already carry the UX if Sahara is backlogged.
  const delays = [120, 160, 220, 300, 420, 600, 800, 1000, 1200, 1400];
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
    if (state === "FILE_PROCESSING_FAILED") {
      return json({ error: "Sahara could not process that recording. Please try again." }, 502);
    }
  }

  return json({ error: "Sahara is still processing this turn.", requestId: fileId }, 202);
}
