/** Competition benchmark orchestration. This module is server-only. */
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type {
  BenchmarkAsrResult,
  BenchmarkLanguageCategory,
  BenchmarkLegalResult,
  BenchmarkRunResponse,
} from "@/lib/benchmark";
import { BENCHMARK_LANGUAGE_CATEGORIES } from "@/lib/benchmark";
import { research } from "@/services/agent/research.server";
import { SAHARA_STT_SYNC_URL } from "@/services/sahara/sahara.server";

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const Input = z.object({
  testId: z.string().trim().min(1).max(80),
  audioId: z.string().trim().min(1).max(120),
  durationMs: z.coerce.number().int().min(0).max(120_000),
  referenceTranscript: z.string().trim().min(1).max(12_000),
  languageCategory: z.enum(BENCHMARK_LANGUAGE_CATEGORIES),
});

const SAHARA_LANGUAGE: Record<BenchmarkLanguageCategory, "en" | "ig" | "pcm"> = {
  English: "en",
  Igbo: "ig",
  "Nigerian Pidgin": "pcm",
  "English + Igbo": "ig",
  "English + Pidgin": "pcm",
  "Igbo + Pidgin": "ig",
  "English + Igbo + Pidgin": "ig",
};

const MMS_ADAPTER: Record<BenchmarkLanguageCategory, "eng" | "ibo" | "pcm"> = {
  English: "eng",
  Igbo: "ibo",
  "Nigerian Pidgin": "pcm",
  "English + Igbo": "ibo",
  "English + Pidgin": "pcm",
  "Igbo + Pidgin": "ibo",
  "English + Igbo + Pidgin": "ibo",
};

type AudioInput = {
  bytes: Uint8Array;
  name: string;
  mime: string;
  category: BenchmarkLanguageCategory;
};

function configuredToken() {
  return process.env["DAMI_BENCHMARK_ACCESS_TOKEN"]?.trim() ?? "";
}

function safeTokenMatch(received: string, expected: string) {
  const receivedHash = createHash("sha256").update(received).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

function benchmarkEnabled() {
  return (
    process.env["NODE_ENV"] !== "production" || process.env["DAMI_BENCHMARK_ENABLED"] === "true"
  );
}

export function benchmarkStatus() {
  const enabled = benchmarkEnabled();
  return {
    enabled,
    tokenRequired: Boolean(configuredToken()) || process.env["NODE_ENV"] === "production",
    providers: {
      sahara: Boolean(process.env["INTRON_API_KEY"]),
      whisper: Boolean(process.env["OPENAI_API_KEY"]),
      model3: Boolean(process.env["DAMI_BENCHMARK_MODEL3_URL"]),
      legalAgent: Boolean(process.env["GROQ_API_KEY"]),
    },
  };
}

export function authorizeBenchmark(request: Request) {
  if (!benchmarkEnabled())
    return { ok: false as const, status: 404, error: "Benchmark mode is disabled." };
  const expected = configuredToken();
  if (process.env["NODE_ENV"] === "production" && !expected)
    return {
      ok: false as const,
      status: 503,
      error: "Benchmark mode needs a server-side access token before it can run in production.",
    };
  if (!expected) return { ok: true as const };
  const authorization = request.headers.get("authorization") ?? "";
  const received = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return safeTokenMatch(received, expected)
    ? { ok: true as const }
    : { ok: false as const, status: 401, error: "The benchmark access token is invalid." };
}

function errorResult(
  modelId: BenchmarkAsrResult["modelId"],
  model: string,
  status: BenchmarkAsrResult["status"],
  configuration: string,
  error: string,
): BenchmarkAsrResult {
  return { modelId, model, status, generatedTranscript: "", latencyMs: null, configuration, error };
}

function audioBlob(input: AudioInput) {
  const buffer = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([buffer], { type: input.mime });
}

async function runSahara(input: AudioInput): Promise<BenchmarkAsrResult> {
  const model = "Intron Sahara v2.5";
  const language = SAHARA_LANGUAGE[input.category];
  const configuration = `Sahara sync STT; language=${language}; LLM corrections disabled`;
  const key = process.env["INTRON_API_KEY"];
  if (!key)
    return errorResult(
      "sahara",
      model,
      "not-configured",
      configuration,
      "INTRON_API_KEY is not configured.",
    );
  const form = new FormData();
  form.set("audio_file_name", input.name);
  form.set("audio_file_blob", audioBlob(input), input.name);
  form.set("use_category", "file_category_legal");
  form.set("use_language_asr_input", language);
  form.set("use_disable_llm_corrections", "TRUE");
  const started = performance.now();
  try {
    const response = await fetch(SAHARA_STT_SYNC_URL, {
      method: "POST",
      signal: AbortSignal.timeout(150_000),
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const raw = await response.text();
    let payload: {
      data?: { audio_transcript?: string; transcript?: string };
      message?: string;
      error?: string;
    } = {};
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      payload = {};
    }
    if (!response.ok)
      throw new Error(payload.message ?? payload.error ?? `Sahara HTTP ${response.status}`);
    const transcript = (payload.data?.audio_transcript ?? payload.data?.transcript ?? "").trim();
    if (!transcript) throw new Error("Sahara returned no transcript.");
    return {
      modelId: "sahara",
      model,
      status: "complete",
      generatedTranscript: transcript,
      latencyMs: Math.round(performance.now() - started),
      configuration,
      error: "",
    };
  } catch (error) {
    return errorResult(
      "sahara",
      model,
      "error",
      configuration,
      error instanceof Error ? error.message : "Sahara transcription failed.",
    );
  }
}

async function runWhisper(input: AudioInput): Promise<BenchmarkAsrResult> {
  const modelName = process.env["DAMI_BENCHMARK_WHISPER_MODEL"] ?? "whisper-1";
  const model = `OpenAI ${modelName}`;
  const configuration = "OpenAI transcription; automatic language detection; no translation";
  const key = process.env["OPENAI_API_KEY"];
  if (!key)
    return errorResult(
      "whisper",
      model,
      "not-configured",
      configuration,
      "OPENAI_API_KEY is not configured.",
    );
  const form = new FormData();
  form.set("file", audioBlob(input), input.name);
  form.set("model", modelName);
  form.set("response_format", "json");
  const started = performance.now();
  try {
    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: "POST",
      signal: AbortSignal.timeout(150_000),
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      text?: string;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(payload.error?.message ?? `Whisper HTTP ${response.status}`);
    const transcript = payload.text?.trim() ?? "";
    if (!transcript) throw new Error("Whisper returned no transcript.");
    return {
      modelId: "whisper",
      model,
      status: "complete",
      generatedTranscript: transcript,
      latencyMs: Math.round(performance.now() - started),
      configuration,
      error: "",
    };
  } catch (error) {
    return errorResult(
      "whisper",
      model,
      "error",
      configuration,
      error instanceof Error ? error.message : "Whisper transcription failed.",
    );
  }
}

async function runModel3(input: AudioInput): Promise<BenchmarkAsrResult> {
  const model = process.env["DAMI_BENCHMARK_MODEL3_NAME"] ?? "Meta MMS 1B All";
  const adapter = MMS_ADAPTER[input.category];
  const configuration = `Meta MMS endpoint; language adapter=${adapter}`;
  const endpoint = process.env["DAMI_BENCHMARK_MODEL3_URL"];
  if (!endpoint)
    return errorResult(
      "model-3",
      model,
      "not-configured",
      configuration,
      "DAMI_BENCHMARK_MODEL3_URL is not configured. The local batch runner remains available.",
    );
  const headers: Record<string, string> = {
    "Content-Type": input.mime,
    "X-Dami-Language-Adapter": adapter,
  };
  const token = process.env["HF_TOKEN"];
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const started = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(150_000),
      headers,
      body: input.bytes as unknown as BodyInit,
    });
    const payload = (await response.json().catch(() => ({}))) as
      | { text?: string; generated_text?: string; error?: string }
      | Array<{ text?: string; generated_text?: string }>;
    const first = Array.isArray(payload) ? payload[0] : payload;
    if (!response.ok)
      throw new Error(
        (!Array.isArray(payload) && payload.error) || `Model 3 HTTP ${response.status}`,
      );
    const transcript = (first?.text ?? first?.generated_text ?? "").trim();
    if (!transcript) throw new Error("Meta MMS returned no transcript.");
    return {
      modelId: "model-3",
      model,
      status: "complete",
      generatedTranscript: transcript,
      latencyMs: Math.round(performance.now() - started),
      configuration,
      error: "",
    };
  } catch (error) {
    return errorResult(
      "model-3",
      model,
      "error",
      configuration,
      error instanceof Error ? error.message : "Meta MMS transcription failed.",
    );
  }
}

async function evaluateLegalTask(asr: BenchmarkAsrResult): Promise<BenchmarkLegalResult> {
  if (asr.status !== "complete")
    return {
      modelId: asr.modelId,
      status: "not-configured",
      answer: "",
      citations: [],
      insufficientEvidence: true,
      intentSuccess: null,
      retrievalSuccess: null,
      groundedAnswerSuccess: null,
      citationSuccess: null,
      downstreamTaskSuccess: null,
      error: "ASR did not produce a transcript.",
    };
  if (!process.env["GROQ_API_KEY"])
    return {
      modelId: asr.modelId,
      status: "not-configured",
      answer: "",
      citations: [],
      insufficientEvidence: true,
      intentSuccess: null,
      retrievalSuccess: null,
      groundedAnswerSuccess: null,
      citationSuccess: null,
      downstreamTaskSuccess: null,
      error: "GROQ_API_KEY is not configured for downstream legal evaluation.",
    };
  try {
    const result = await research(asr.generatedTranscript);
    const retrievalSuccess = result.citations.length > 0;
    return {
      modelId: asr.modelId,
      status: "complete",
      answer: result.answer,
      citations: result.citations,
      insufficientEvidence: result.insufficientEvidence,
      // Intent is deliberately human-reviewed; an unexplained LLM score would
      // make the benchmark less transparent.
      intentSuccess: null,
      retrievalSuccess,
      groundedAnswerSuccess: retrievalSuccess && !result.insufficientEvidence,
      citationSuccess:
        retrievalSuccess && result.citations.every((citation) => Boolean(citation.url)),
      downstreamTaskSuccess: null,
      error: "",
    };
  } catch (error) {
    return {
      modelId: asr.modelId,
      status: "error",
      answer: "",
      citations: [],
      insufficientEvidence: true,
      intentSuccess: null,
      retrievalSuccess: false,
      groundedAnswerSuccess: false,
      citationSuccess: false,
      downstreamTaskSuccess: null,
      error: error instanceof Error ? error.message : "Legal pipeline evaluation failed.",
    };
  }
}

export async function runBenchmark(form: FormData): Promise<BenchmarkRunResponse> {
  const parsed = Input.parse({
    testId: form.get("testId"),
    audioId: form.get("audioId"),
    durationMs: form.get("durationMs") ?? 0,
    referenceTranscript: form.get("referenceTranscript"),
    languageCategory: form.get("languageCategory"),
  });
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) throw new Error("Record or upload an audio sample first.");
  if (audio.size < 512) throw new Error("The audio sample is empty or too short.");
  if (audio.size > MAX_AUDIO_BYTES) throw new Error("Keep benchmark audio below 20 MB.");
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const name =
    "name" in audio && typeof audio.name === "string" ? audio.name : `${parsed.audioId}.webm`;
  const input: AudioInput = {
    bytes,
    name: name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120),
    mime: audio.type || "application/octet-stream",
    category: parsed.languageCategory,
  };
  // Each model receives the original, byte-identical audio concurrently. No
  // model transcript is ever fed into another model.
  const results = await Promise.all([runSahara(input), runWhisper(input), runModel3(input)]);
  const legalResults = await Promise.all(results.map(evaluateLegalTask));
  const usesExperimentalCombination = ["Igbo + Pidgin", "English + Igbo + Pidgin"].includes(
    parsed.languageCategory,
  );
  return {
    ...parsed,
    audioSha256: createHash("sha256").update(bytes).digest("hex"),
    configurationNote: usesExperimentalCombination
      ? "Sahara documents Igbo-English (ig) and Pidgin-English (pcm), but no trilingual/Igbo-Pidgin code. This run uses ig and reports that limitation instead of inventing AUTO."
      : `Sahara documented language code: ${SAHARA_LANGUAGE[parsed.languageCategory]}.`,
    results,
    legalResults,
  };
}
