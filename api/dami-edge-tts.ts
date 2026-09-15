import type { VercelRequest, VercelResponse } from "@vercel/node";
import { EdgeTTS } from "node-edge-tts";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const text = typeof req.body?.text === "string" ? req.body.text.trim().slice(0, 1200) : "";
  if (!text) return res.status(400).json({ error: "Text is required" });

  const path = join(tmpdir(), `dami-edge-${randomUUID()}.mp3`);
  try {
    const tts = new EdgeTTS({
      voice: "en-NG-EzinneNeural",
      lang: "en-NG",
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
      rate: "+8%",
      pitch: "default",
      volume: "default",
      timeout: 12000,
    });
    await tts.ttsPromise(text, path);
    const audio = await readFile(path);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(audio);
  } catch (error) {
    return res.status(503).json({
      error: "Fallback neural voice unavailable",
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await unlink(path).catch(() => undefined);
  }
}
