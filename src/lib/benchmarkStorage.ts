import type { BenchmarkRecord } from "./benchmark";

const STORAGE_KEY = "dami_benchmark_records_v1";

export function loadBenchmarkRecords(): BenchmarkRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? (value as BenchmarkRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveBenchmarkRecords(records: BenchmarkRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function mergeBenchmarkRecords(existing: BenchmarkRecord[], incoming: BenchmarkRecord[]) {
  const keys = new Set(incoming.map((row) => `${row.testId}:${row.modelId}`));
  return [...existing.filter((row) => !keys.has(`${row.testId}:${row.modelId}`)), ...incoming];
}

function csvCell(value: unknown) {
  const text =
    typeof value === "string"
      ? value
      : value === null || value === undefined
        ? ""
        : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function benchmarkCsv(records: BenchmarkRecord[]) {
  const fields: Array<keyof BenchmarkRecord> = [
    "testId",
    "audioId",
    "audioSha256",
    "duration",
    "languageCategory",
    "referenceTranscript",
    "model",
    "generatedTranscript",
    "wer",
    "cer",
    "latencyMs",
    "codeSwitchScore",
    "legalEntityAccuracy",
    "intentSuccess",
    "retrievalSuccess",
    "groundedAnswerSuccess",
    "citationSuccess",
    "downstreamTaskSuccess",
    "reviewNotes",
    "timestamp",
    "providerStatus",
    "providerError",
    "providerConfiguration",
    "saharaConfigurationNote",
    "codeSwitchTokens",
    "criticalEntities",
    "criticalEntitiesPreserved",
    "legalAnswer",
    "citations",
  ];
  return [
    fields.map(csvCell).join(","),
    ...records.map((record) => fields.map((field) => csvCell(record[field])).join(",")),
  ].join("\n");
}

export function downloadBenchmarkFile(records: BenchmarkRecord[], format: "csv" | "json") {
  const content =
      format === "csv"
        ? benchmarkCsv(records)
        : JSON.stringify({ schemaVersion: 1, records }, null, 2),
    blob = new Blob([content], {
      type: format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dami-benchmark-${new Date().toISOString().slice(0, 10)}.${format}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
