import { z } from "zod";

import {
  SaharaNotConfiguredError,
  SaharaRequestError,
  synthesize,
  transcribe,
} from "@/services/sahara/sahara.server";

const SttBody = z.object({
  audioBase64: z.string().min(1),
  sampleRate: z.number().int().min(8000).max(48000),
  language: z.string().default("en"),
  codeSwitching: z.boolean().default(false),
});

const TtsBody = z.object({
  text: z.string().min(1).max(6000),
  accent: z.string().default("yoruba"),
  gender: z.string().default("female"),
  language: z.string().default("en"),
});


function pcm16WavFromBase64(audioBase64: string, sampleRate: number) {
  const bytes = Uint8Array.from(atob(audioBase64), (ch) => ch.charCodeAt(0));
  const buffer = new ArrayBuffer(44 + bytes.length);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF"); view.setUint32(4, 36 + bytes.length, true); write(8, "WAVE");
  write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, bytes.length, true);
  new Uint8Array(buffer, 44).set(bytes);
  return new Blob([buffer], { type: "audio/wav" });
}

async function groqTranscribe(data: z.infer<typeof SttBody>) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const form = new FormData();
  form.set("file", pcm16WavFromBase64(data.audioBase64, data.sampleRate), "dami.wav");
  form.set("model", "whisper-large-v3");
  form.set("response_format", "json");
  form.set("temperature", "0");
  if (data.language === "en" && !data.codeSwitching) form.set("language", "en");
  form.set("prompt", "African legal conversation. Preserve Nigerian Pidgin, Igbo and English code-switching. Terms may include Constitution, Nigeria Police Force, Evidence Act, Administration of Criminal Justice Act, fundamental rights, arrest, court, lawyer and Dami.");
  const started = Date.now();
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  const payload = (await response.json().catch(() => null)) as { text?: string } | null;
  const text = payload?.text?.trim();
  return response.ok && text
    ? { text, durationMs: Date.now() - started, requestId: null, engine: "groq-whisper-large-v3", language: data.language }
    : null;
}

export async function handleSaharaStt(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = SttBody.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "That recording couldn't be read. Please try again." },
      { status: 400 },
    );

  try {
    const result = await transcribe(parsed.data);
    if (!result.text)
      return Response.json(
        { error: "Dami didn't catch any speech in that recording." },
        { status: 422 },
      );
    return Response.json(result);
  } catch (error) {
    const fallback = await groqTranscribe(parsed.data).catch(() => null);
    if (fallback) return Response.json(fallback);
    if (error instanceof SaharaNotConfiguredError)
      return Response.json({ error: error.message, code: "not_configured" }, { status: 503 });
    if (error instanceof SaharaRequestError)
      return Response.json({ error: error.message }, { status: 502 });
    console.error("Sahara STT failed", error);
    return Response.json({ error: "Dami couldn't reach the speech service just now." }, { status: 502 });
  }
}

export async function handleSaharaTts(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = TtsBody.safeParse(body);
  if (!parsed.success)
    return Response.json({ error: "There was nothing for Dami to read aloud." }, { status: 400 });

  try {
    const { audio, mime } = await synthesize(parsed.data);
    return new Response(audio as unknown as BodyInit, {
      headers: { "Content-Type": mime, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SaharaNotConfiguredError)
      return Response.json({ error: error.message, code: "not_configured" }, { status: 503 });
    if (error instanceof SaharaRequestError)
      return Response.json({ error: error.message }, { status: 502 });
    console.error("Sahara TTS failed", error);
    return Response.json(
      { error: "Dami couldn't speak that answer aloud just now." },
      { status: 502 },
    );
  }
}
