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
  accent: z.string().default("ghanaian"),
  gender: z.string().default("female"),
  language: z.string().default("en-GH"),
});

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
    if (error instanceof SaharaNotConfiguredError)
      return Response.json({ error: error.message, code: "not_configured" }, { status: 503 });
    if (error instanceof SaharaRequestError)
      return Response.json({ error: error.message }, { status: 502 });
    console.error("Sahara STT failed", error);
    return Response.json(
      { error: "Dami couldn't reach the speech service just now." },
      { status: 502 },
    );
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
