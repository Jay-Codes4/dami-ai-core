import { createFileRoute } from "@tanstack/react-router";
import { Download, Loader2, Mic, Square, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  aggregateBenchmark,
  BENCHMARK_LANGUAGE_CATEGORIES,
  bestMeasured,
  buildBenchmarkRecord,
  splitReviewList,
  withHumanReview,
  type BenchmarkLegalResult,
  type BenchmarkModelId,
  type BenchmarkRecord,
  type BenchmarkRunResponse,
} from "@/lib/benchmark";
import {
  downloadBenchmarkFile,
  loadBenchmarkRecords,
  mergeBenchmarkRecords,
  saveBenchmarkRecords,
} from "@/lib/benchmarkStorage";

export const Route = createFileRoute("/benchmark")({
  head: () => ({
    meta: [
      { title: "Dami ASR Benchmark" },
      {
        name: "description",
        content: "Controlled Sahara and two Groq Whisper code-switching baselines for Dami AI.",
      },
    ],
  }),
  component: BenchmarkPage,
});

type BenchmarkStatus = {
  enabled: boolean;
  providers: { sahara: boolean; whisper: boolean; model3: boolean; legalAgent: boolean };
};
type ReviewField =
  "intentSuccess" | "retrievalSuccess" | "groundedAnswerSuccess" | "citationSuccess";

function percent(value: number | null) {
  return value === null ? "Not measured" : `${(value * 100).toFixed(2)}%`;
}

function milliseconds(value: number | null) {
  return value === null ? "Not measured" : `${value.toLocaleString()} ms`;
}

function scoreSummary(
  rows: ReturnType<typeof aggregateBenchmark>,
  label: string,
  category: Parameters<typeof bestMeasured>[1],
  metric: Parameters<typeof bestMeasured>[2],
  direction: Parameters<typeof bestMeasured>[3],
) {
  const measured = bestMeasured(rows, category, metric, direction);
  if (measured.value === null) return { label, value: "Awaiting measured samples" };
  const rendered =
    metric === "averageLatencyMs" ? `${Math.round(measured.value)} ms` : percent(measured.value);
  return { label, value: `${measured.winners.join(" / ")} · ${rendered}` };
}

function reviewValue(value: string): boolean | null {
  if (value === "pass") return true;
  if (value === "fail") return false;
  return null;
}

function BenchmarkPage() {
  const [status, setStatus] = useState<BenchmarkStatus | null>(null),
    [testId, setTestId] = useState("EN-IG-001"),
    [audioId, setAudioId] = useState("EN-IG-001-AUDIO"),
    [languageCategory, setLanguageCategory] =
      useState<(typeof BENCHMARK_LANGUAGE_CATEGORIES)[number]>("English + Igbo"),
    [referenceTranscript, setReferenceTranscript] = useState(""),
    [codeSwitchTokens, setCodeSwitchTokens] = useState(""),
    [criticalEntities, setCriticalEntities] = useState(""),
    [audio, setAudio] = useState<{ blob: Blob; name: string; durationMs: number } | null>(null),
    [recording, setRecording] = useState(false),
    [running, setRunning] = useState(false),
    [error, setError] = useState(""),
    [records, setRecords] = useState<BenchmarkRecord[]>([]),
    [currentRecords, setCurrentRecords] = useState<BenchmarkRecord[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null),
    mediaStreamRef = useRef<MediaStream | null>(null),
    recordingStartedRef = useRef(0),
    recordingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setRecords(loadBenchmarkRecords());
    void fetch("/benchmark/run", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as BenchmarkStatus) : null))
      .then((value) => setStatus(value))
      .catch(() => setStatus(null));
    return () => {
      if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const aggregates = useMemo(() => aggregateBenchmark(records), [records]);
  const summaries = useMemo(
    () => [
      scoreSummary(aggregates, "Best overall WER", "Overall", "wer", "lowest"),
      scoreSummary(aggregates, "Best overall CER", "Overall", "cer", "lowest"),
      scoreSummary(aggregates, "Fastest ASR", "Overall", "averageLatencyMs", "lowest"),
      scoreSummary(aggregates, "Best English", "English", "wer", "lowest"),
      scoreSummary(aggregates, "Best Igbo", "Igbo", "wer", "lowest"),
      scoreSummary(aggregates, "Best Nigerian Pidgin", "Nigerian Pidgin", "wer", "lowest"),
      scoreSummary(
        aggregates,
        "Best English + Igbo preservation",
        "English + Igbo",
        "codeSwitchPreservation",
        "highest",
      ),
      scoreSummary(
        aggregates,
        "Best English + Pidgin preservation",
        "English + Pidgin",
        "codeSwitchPreservation",
        "highest",
      ),
      scoreSummary(
        aggregates,
        "Best three-language preservation",
        "English + Igbo + Pidgin",
        "codeSwitchPreservation",
        "highest",
      ),
      scoreSummary(
        aggregates,
        "Best legal entity accuracy",
        "Overall",
        "legalEntityAccuracy",
        "highest",
      ),
      scoreSummary(
        aggregates,
        "Best downstream task success",
        "Overall",
        "downstreamTaskSuccess",
        "highest",
      ),
    ],
    [aggregates],
  );

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  const startAudioRecording = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(
        "This browser cannot record benchmark audio. Upload a permitted audio file instead.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined),
        chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Math.min(120_000, Date.now() - recordingStartedRef.current),
          blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);
        if (recordingTimerRef.current) window.clearTimeout(recordingTimerRef.current);
        recordingTimerRef.current = null;
        if (blob.size) setAudio({ blob, name: `${audioId || "dami-benchmark"}.webm`, durationMs });
      };
      mediaRecorderRef.current = recorder;
      recordingStartedRef.current = Date.now();
      recorder.start(250);
      setRecording(true);
      recordingTimerRef.current = window.setTimeout(stopRecording, 120_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dami could not open the microphone.");
    }
  };

  const selectAudioFile = (file: File | undefined) => {
    if (!file) return;
    setError("");
    setAudio({ blob: file, name: file.name, durationMs: 0 });
  };

  const run = async () => {
    if (!audio || !referenceTranscript.trim()) {
      setError("Add one audio sample and the exact human reference transcript first.");
      return;
    }
    setRunning(true);
    setError("");
    try {
      const form = new FormData();
      form.set("testId", testId.trim());
      form.set("audioId", audioId.trim());
      form.set("durationMs", String(audio.durationMs));
      form.set("referenceTranscript", referenceTranscript.trim());
      form.set("languageCategory", languageCategory);
      form.set("audio", audio.blob, audio.name);
      const request: RequestInit = {
        method: "POST",
        body: form,
      };
      const response = await fetch("/benchmark/run", request);
      const payload = (await response.json().catch(() => ({}))) as BenchmarkRunResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || `Benchmark HTTP ${response.status}`);
      const timestamp = new Date().toISOString(),
        tokens = splitReviewList(codeSwitchTokens),
        entities = splitReviewList(criticalEntities),
        incoming = payload.results.map((asr) => {
          const legal = payload.legalResults.find((item) => item.modelId === asr.modelId),
            input = {
              response: payload,
              asr,
              codeSwitchTokens: tokens,
              criticalEntities: entities,
              timestamp,
            };
          return buildBenchmarkRecord(legal ? { ...input, legal } : input);
        }),
        next = mergeBenchmarkRecords(records, incoming);
      setCurrentRecords(incoming);
      setRecords(next);
      saveBenchmarkRecords(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The benchmark run failed.");
    } finally {
      setRunning(false);
    }
  };

  const setReview = (modelId: BenchmarkModelId, field: ReviewField, value: boolean | null) => {
    const update = (row: BenchmarkRecord) => {
      if (row.modelId !== modelId || row.testId !== testId.trim()) return row;
      return withHumanReview(row, {
        intentSuccess: field === "intentSuccess" ? value : row.intentSuccess,
        retrievalSuccess: field === "retrievalSuccess" ? value : row.retrievalSuccess,
        groundedAnswerSuccess:
          field === "groundedAnswerSuccess" ? value : row.groundedAnswerSuccess,
        citationSuccess: field === "citationSuccess" ? value : row.citationSuccess,
        reviewNotes: row.reviewNotes,
      });
    };
    const nextRecords = records.map(update),
      nextCurrent = currentRecords.map(update);
    setRecords(nextRecords);
    setCurrentRecords(nextCurrent);
    saveBenchmarkRecords(nextRecords);
  };

  const setNotes = (modelId: BenchmarkModelId, value: string) => {
    const update = (row: BenchmarkRecord) =>
      row.modelId === modelId && row.testId === testId.trim()
        ? withHumanReview(row, {
            intentSuccess: row.intentSuccess,
            retrievalSuccess: row.retrievalSuccess,
            groundedAnswerSuccess: row.groundedAnswerSuccess,
            citationSuccess: row.citationSuccess,
            reviewNotes: value,
          })
        : row;
    const nextRecords = records.map(update),
      nextCurrent = currentRecords.map(update);
    setRecords(nextRecords);
    setCurrentRecords(nextCurrent);
    saveBenchmarkRecords(nextRecords);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="max-w-3xl space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Competition benchmark 
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            African code-switch ASR benchmark
          </h1>
          <p className="leading-7 text-muted-foreground">
            Run the same unedited audio independently through Sahara, Whisper and Meta MMS. Raw
            transcripts and provider failures stay visible; scores come only from measured output.
            Audio is processed for this run and is not stored in the browser records.
          </p>
        </header>

        {status && !status.enabled && (
          <Alert>
            <AlertTitle>Benchmark mode is disabled</AlertTitle>
            <AlertDescription>
              The public competition benchmark is temporarily unavailable on the server.
            </AlertDescription>
          </Alert>
        )}

        <section className="grid gap-6 border bg-card p-5 lg:grid-cols-2 lg:p-7">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Test ID
                <input
                  value={testId}
                  onChange={(event) => setTestId(event.target.value)}
                  className="mt-1 h-11 w-full rounded-md border bg-background px-3 font-normal"
                  placeholder="EN-IG-001"
                />
              </label>
              <label className="text-sm font-medium">
                Audio ID
                <input
                  value={audioId}
                  onChange={(event) => setAudioId(event.target.value)}
                  className="mt-1 h-11 w-full rounded-md border bg-background px-3 font-normal"
                  placeholder="EN-IG-001-AUDIO"
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Language category
              <select
                value={languageCategory}
                onChange={(event) =>
                  setLanguageCategory(
                    event.target.value as (typeof BENCHMARK_LANGUAGE_CATEGORIES)[number],
                  )
                }
                className="mt-1 h-11 w-full rounded-md border bg-background px-3 font-normal"
              >
                {BENCHMARK_LANGUAGE_CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Exact human reference transcript
              <Textarea
                value={referenceTranscript}
                onChange={(event) => setReferenceTranscript(event.target.value)}
                rows={5}
                className="mt-1 font-normal"
                placeholder="Write exactly what was spoken. Keep Igbo, Pidgin and every language switch."
              />
            </label>
            <label className="block text-sm font-medium">
              Code-switch words or phrases to review
              <Textarea
                value={codeSwitchTokens}
                onChange={(event) => setCodeSwitchTokens(event.target.value)}
                rows={2}
                className="mt-1 font-normal"
                placeholder="Comma or newline separated, for example: biko, wetin, section 36"
              />
            </label>
            <label className="block text-sm font-medium">
              Critical legal entities
              <Textarea
                value={criticalEntities}
                onChange={(event) => setCriticalEntities(event.target.value)}
                rows={2}
                className="mt-1 font-normal"
                placeholder="Constitution, section 36, Lagos State, 12 June 2024"
              />
            </label>
          </div>

          <div className="space-y-5">
            <div className="border border-dashed p-5">
              <h2 className="font-semibold">Audio sample</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use consented or licensed audio only. One file, unchanged, is sent to every model.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {recording ? (
                  <Button type="button" variant="destructive" onClick={stopRecording}>
                    <Square className="mr-2 h-4 w-4" /> Stop recording
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void startAudioRecording()}
                  >
                    <Mic className="mr-2 h-4 w-4" /> Record audio
                  </Button>
                )}
                <Button asChild type="button" variant="outline">
                  <label>
                    <Upload className="mr-2 h-4 w-4" /> Upload audio
                    <input
                      type="file"
                      accept="audio/*"
                      className="sr-only"
                      onChange={(event) => selectAudioFile(event.target.files?.[0])}
                    />
                  </label>
                </Button>
              </div>
              <p className="mt-3 break-all text-xs text-muted-foreground" aria-live="polite">
                {recording
                  ? "Recording… stop when the exact reference utterance is complete."
                  : audio
                    ? `${audio.name} · ${(audio.blob.size / 1024).toFixed(1)} KB`
                    : "No audio selected."}
              </p>
            </div>



            {status && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(status.providers).map(([provider, ready]) => (
                  <div key={provider} className="border px-3 py-2">
                    <span className="capitalize">
                      {provider === "whisper"
                        ? "Groq Whisper Large V3"
                        : provider === "model3"
                          ? "Groq Whisper Large V3 Turbo"
                          : provider}
                    </span>
                    <span className={ready ? "ml-2 text-emerald-600" : "ml-2 text-amber-600"}>
                      {ready ? "configured" : "not configured"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <Button
              size="lg"
              className="w-full"
              disabled={running || recording || status?.enabled === false}
              onClick={() => void run()}
            >
              {running && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              {running ? "Running three ASR models and legal tasks…" : "Run benchmark"}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs leading-5 text-muted-foreground">
              Sahara documents <strong>ig</strong> for Igbo-English and <strong>pcm</strong> for
              Pidgin-English. It does not publish a combined Igbo-Pidgin/trilingual code; those
              categories are marked experimental and never relabelled as automatic detection.
            </p>
          </div>
        </section>

        {currentRecords.length > 0 && (
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold">Latest comparison</h2>
              <p className="text-sm text-muted-foreground">
                Review intent and the objective legal-pipeline signals before marking overall task
                success.
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {currentRecords.map((record) => (
                <article key={record.modelId} className="min-w-0 border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{record.model}</h3>
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      {record.providerStatus}
                    </span>
                  </div>
                  {record.providerStatus === "complete" ? (
                    <>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
                        {record.generatedTranscript}
                      </p>
                      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <div className="border p-2">
                          <dt>WER</dt>
                          <dd className="font-semibold">{percent(record.wer)}</dd>
                        </div>
                        <div className="border p-2">
                          <dt>CER</dt>
                          <dd className="font-semibold">{percent(record.cer)}</dd>
                        </div>
                        <div className="border p-2">
                          <dt>Latency</dt>
                          <dd className="font-semibold">{milliseconds(record.latencyMs)}</dd>
                        </div>
                        <div className="border p-2">
                          <dt>Code-switch</dt>
                          <dd className="font-semibold">{percent(record.codeSwitchScore)}</dd>
                        </div>
                        <div className="border p-2">
                          <dt>Legal entities</dt>
                          <dd className="font-semibold">{percent(record.legalEntityAccuracy)}</dd>
                        </div>
                        <div className="border p-2">
                          <dt>Overall task</dt>
                          <dd className="font-semibold">
                            {record.downstreamTaskSuccess === null
                              ? "Review"
                              : record.downstreamTaskSuccess
                                ? "PASS"
                                : "FAIL"}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 space-y-2">
                        {(
                          [
                            ["intentSuccess", "Intent understood"],
                            ["retrievalSuccess", "Relevant evidence"],
                            ["groundedAnswerSuccess", "Answer grounded"],
                            ["citationSuccess", "Citation usable"],
                          ] as Array<[ReviewField, string]>
                        ).map(([field, label]) => (
                          <label
                            key={field}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            {label}
                            <select
                              value={
                                record[field] === null ? "review" : record[field] ? "pass" : "fail"
                              }
                              onChange={(event) =>
                                setReview(record.modelId, field, reviewValue(event.target.value))
                              }
                              className="h-8 rounded-md border bg-background px-2"
                            >
                              <option value="review">REVIEW</option>
                              <option value="pass">PASS</option>
                              <option value="fail">FAIL</option>
                            </select>
                          </label>
                        ))}
                      </div>
                      <details className="mt-4 text-sm">
                        <summary className="cursor-pointer font-medium">
                          Downstream legal result
                        </summary>
                        <p className="mt-2 whitespace-pre-wrap leading-6 text-muted-foreground">
                          {record.legalAnswer || record.legalTaskError || "Not configured."}
                        </p>
                        {record.citations.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {record.citations.map((citation) => (
                              <li key={citation.sourceId}>
                                <a
                                  className="text-primary underline"
                                  href={citation.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {citation.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </details>
                      <label className="mt-4 block text-xs font-medium">
                        Reviewer notes
                        <Textarea
                          value={record.reviewNotes}
                          onChange={(event) => setNotes(record.modelId, event.target.value)}
                          rows={3}
                          className="mt-1 font-normal"
                        />
                      </label>
                    </>
                  ) : (
                    <p className="mt-4 text-sm leading-6 text-destructive">
                      No score was generated: {record.providerError}
                    </p>
                  )}
                  <p className="mt-4 break-words text-[11px] leading-5 text-muted-foreground">
                    {record.providerConfiguration}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Saved measured evidence</h2>
              <p className="text-sm text-muted-foreground">
                {records.length} model rows. No audio is kept here.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!records.length}
                onClick={() => downloadBenchmarkFile(records, "csv")}
              >
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
              <Button
                variant="outline"
                disabled={!records.length}
                onClick={() => downloadBenchmarkFile(records, "json")}
              >
                <Download className="mr-2 h-4 w-4" /> JSON
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map((summary) => (
              <div key={summary.label} className="border p-3">
                <p className="text-xs text-muted-foreground">{summary.label}</p>
                <p className="mt-1 text-sm font-semibold">{summary.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto border">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="border-b bg-muted/50">
                <tr>
                  {[
                    "Model",
                    "Category",
                    "Samples",
                    "WER",
                    "CER",
                    "Avg latency",
                    "Code-switch",
                    "Legal entities",
                    "Downstream success",
                  ].map((heading) => (
                    <th key={heading} className="px-3 py-2 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aggregates.length ? (
                  aggregates.map((row) => (
                    <tr key={`${row.modelId}-${row.category}`} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{row.model}</td>
                      <td className="px-3 py-2">{row.category}</td>
                      <td className="px-3 py-2">
                        {row.successfulSamples}/{row.samples}
                      </td>
                      <td className="px-3 py-2">{percent(row.wer)}</td>
                      <td className="px-3 py-2">{percent(row.cer)}</td>
                      <td className="px-3 py-2">{milliseconds(row.averageLatencyMs)}</td>
                      <td className="px-3 py-2">{percent(row.codeSwitchPreservation)}</td>
                      <td className="px-3 py-2">{percent(row.legalEntityAccuracy)}</td>
                      <td className="px-3 py-2">{percent(row.downstreamTaskSuccess)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      Run permitted audio samples to populate real results.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
