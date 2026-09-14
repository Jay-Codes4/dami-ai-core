import type { Citation } from "./types";

export const BENCHMARK_LANGUAGE_CATEGORIES = [
  "English",
  "Igbo",
  "Nigerian Pidgin",
  "English + Igbo",
  "English + Pidgin",
  "Igbo + Pidgin",
  "English + Igbo + Pidgin",
] as const;

export type BenchmarkLanguageCategory = (typeof BENCHMARK_LANGUAGE_CATEGORIES)[number];
export type BenchmarkModelId = "sahara" | "whisper" | "model-3";
export type BenchmarkProviderStatus = "complete" | "error" | "not-configured";

export interface BenchmarkAsrResult {
  modelId: BenchmarkModelId;
  model: string;
  status: BenchmarkProviderStatus;
  generatedTranscript: string;
  latencyMs: number | null;
  configuration: string;
  error: string;
}

export interface BenchmarkAsrResponse {
  testId: string;
  audioId: string;
  audioSha256: string;
  durationMs: number;
  languageCategory: BenchmarkLanguageCategory;
  referenceTranscript: string;
  configurationNote: string;
  results: BenchmarkAsrResult[];
}

export interface BenchmarkRunResponse extends BenchmarkAsrResponse {
  legalResults: BenchmarkLegalResult[];
}

export interface BenchmarkLegalResult {
  modelId: BenchmarkModelId;
  status: "complete" | "error" | "not-configured";
  answer: string;
  citations: Citation[];
  insufficientEvidence: boolean;
  intentSuccess: boolean | null;
  retrievalSuccess: boolean | null;
  groundedAnswerSuccess: boolean | null;
  citationSuccess: boolean | null;
  downstreamTaskSuccess: boolean | null;
  error: string;
}

export interface BenchmarkRecord {
  testId: string;
  audioId: string;
  audioSha256: string;
  duration: number;
  languageCategory: BenchmarkLanguageCategory;
  referenceTranscript: string;
  modelId: BenchmarkModelId;
  model: string;
  generatedTranscript: string;
  wer: number | null;
  cer: number | null;
  latencyMs: number | null;
  codeSwitchScore: number | null;
  codeSwitchTokens: string[];
  legalEntityAccuracy: number | null;
  criticalEntities: string[];
  criticalEntitiesPreserved: string[];
  intentSuccess: boolean | null;
  retrievalSuccess: boolean | null;
  groundedAnswerSuccess: boolean | null;
  citationSuccess: boolean | null;
  downstreamTaskSuccess: boolean | null;
  reviewNotes: string;
  timestamp: string;
  providerStatus: BenchmarkProviderStatus;
  providerError: string;
  providerConfiguration: string;
  saharaConfigurationNote: string;
  legalAnswer: string;
  citations: Citation[];
  legalTaskStatus: BenchmarkLegalResult["status"];
  legalTaskError: string;
  referenceWordCount: number;
  wordEdits: number | null;
  referenceCharacterCount: number;
  characterEdits: number | null;
}

export interface BenchmarkAggregate {
  modelId: BenchmarkModelId;
  model: string;
  category: BenchmarkLanguageCategory | "Overall";
  samples: number;
  successfulSamples: number;
  wer: number | null;
  cer: number | null;
  averageLatencyMs: number | null;
  codeSwitchPreservation: number | null;
  legalEntityAccuracy: number | null;
  downstreamTaskSuccess: number | null;
}

export function normalizeBenchmarkText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{M}\p{N}\s'’-]/gu, " ")
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function editDistance<T>(reference: readonly T[], hypothesis: readonly T[]) {
  let previous = Array.from({ length: hypothesis.length + 1 }, (_, index) => index);
  for (let row = 1; row <= reference.length; row += 1) {
    const current = [row, ...Array<number>(hypothesis.length).fill(0)];
    for (let column = 1; column <= hypothesis.length; column += 1) {
      const substitution = reference[row - 1] === hypothesis[column - 1] ? 0 : 1;
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + substitution,
      );
    }
    previous = current;
  }
  return previous[hypothesis.length] ?? reference.length;
}

export function calculateErrorRates(reference: string, hypothesis: string) {
  const normalizedReference = normalizeBenchmarkText(reference),
    normalizedHypothesis = normalizeBenchmarkText(hypothesis),
    referenceWords = normalizedReference ? normalizedReference.split(" ") : [],
    hypothesisWords = normalizedHypothesis ? normalizedHypothesis.split(" ") : [],
    referenceCharacters = Array.from(normalizedReference),
    hypothesisCharacters = Array.from(normalizedHypothesis),
    wordEdits = referenceWords.length ? editDistance(referenceWords, hypothesisWords) : null,
    characterEdits = referenceCharacters.length
      ? editDistance(referenceCharacters, hypothesisCharacters)
      : null;
  return {
    wer: wordEdits === null ? null : wordEdits / referenceWords.length,
    cer: characterEdits === null ? null : characterEdits / referenceCharacters.length,
    wordEdits,
    referenceWordCount: referenceWords.length,
    characterEdits,
    referenceCharacterCount: referenceCharacters.length,
  };
}

function escaped(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitReviewList(value: string) {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function preservationScore(targets: readonly string[], hypothesis: string) {
  const normalizedTargets = targets.map(normalizeBenchmarkText).filter(Boolean),
    normalizedHypothesis = normalizeBenchmarkText(hypothesis);
  if (!normalizedTargets.length) return { score: null, preserved: [] as string[] };
  const preserved = normalizedTargets.filter((target) =>
    new RegExp(`(?:^|\\s)${escaped(target)}(?:$|\\s)`, "u").test(normalizedHypothesis),
  );
  return { score: preserved.length / normalizedTargets.length, preserved };
}

export function buildBenchmarkRecord(input: {
  response: BenchmarkAsrResponse;
  asr: BenchmarkAsrResult;
  legal?: BenchmarkLegalResult;
  codeSwitchTokens: string[];
  criticalEntities: string[];
  timestamp?: string;
}): BenchmarkRecord {
  const { response, asr, legal } = input,
    measured = asr.status === "complete",
    rates = measured
      ? calculateErrorRates(response.referenceTranscript, asr.generatedTranscript)
      : {
          wer: null,
          cer: null,
          wordEdits: null,
          referenceWordCount: normalizeBenchmarkText(response.referenceTranscript)
            .split(" ")
            .filter(Boolean).length,
          characterEdits: null,
          referenceCharacterCount: Array.from(normalizeBenchmarkText(response.referenceTranscript))
            .length,
        },
    switched = measured
      ? preservationScore(input.codeSwitchTokens, asr.generatedTranscript)
      : { score: null, preserved: [] as string[] },
    entities = measured
      ? preservationScore(input.criticalEntities, asr.generatedTranscript)
      : { score: null, preserved: [] as string[] };
  return {
    testId: response.testId,
    audioId: response.audioId,
    audioSha256: response.audioSha256,
    duration: response.durationMs,
    languageCategory: response.languageCategory,
    referenceTranscript: response.referenceTranscript,
    modelId: asr.modelId,
    model: asr.model,
    generatedTranscript: asr.generatedTranscript,
    wer: rates.wer,
    cer: rates.cer,
    latencyMs: asr.latencyMs,
    codeSwitchScore: switched.score,
    codeSwitchTokens: input.codeSwitchTokens,
    legalEntityAccuracy: entities.score,
    criticalEntities: input.criticalEntities,
    criticalEntitiesPreserved: entities.preserved,
    intentSuccess: legal?.intentSuccess ?? null,
    retrievalSuccess: legal?.retrievalSuccess ?? null,
    groundedAnswerSuccess: legal?.groundedAnswerSuccess ?? null,
    citationSuccess: legal?.citationSuccess ?? null,
    downstreamTaskSuccess: legal?.downstreamTaskSuccess ?? null,
    reviewNotes: "",
    timestamp: input.timestamp ?? new Date().toISOString(),
    providerStatus: asr.status,
    providerError: asr.error,
    providerConfiguration: asr.configuration,
    saharaConfigurationNote: response.configurationNote,
    legalAnswer: legal?.answer ?? "",
    citations: legal?.citations ?? [],
    legalTaskStatus: legal?.status ?? "not-configured",
    legalTaskError: legal?.error ?? "",
    referenceWordCount: rates.referenceWordCount,
    wordEdits: rates.wordEdits,
    referenceCharacterCount: rates.referenceCharacterCount,
    characterEdits: rates.characterEdits,
  };
}

function average(values: Array<number | null>) {
  const measured = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null;
}

export function aggregateBenchmark(records: BenchmarkRecord[]): BenchmarkAggregate[] {
  const groups = new Map<
    string,
    { category: BenchmarkAggregate["category"]; items: BenchmarkRecord[] }
  >();
  for (const record of records) {
    for (const category of [record.languageCategory, "Overall"] as const) {
      const key = `${record.modelId}:${category}`,
        group = groups.get(key) ?? { category, items: [] };
      group.items.push(record);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(({ category, items }) => {
    const first = items[0]!,
      wordEdits = items.reduce((sum, item) => sum + (item.wordEdits ?? 0), 0),
      words = items.reduce(
        (sum, item) => sum + (item.wordEdits === null ? 0 : item.referenceWordCount),
        0,
      ),
      characterEdits = items.reduce((sum, item) => sum + (item.characterEdits ?? 0), 0),
      characters = items.reduce(
        (sum, item) => sum + (item.characterEdits === null ? 0 : item.referenceCharacterCount),
        0,
      );
    return {
      modelId: first.modelId,
      model: first.model,
      category,
      samples: items.length,
      successfulSamples: items.filter((item) => item.providerStatus === "complete").length,
      wer: words ? wordEdits / words : null,
      cer: characters ? characterEdits / characters : null,
      averageLatencyMs: average(items.map((item) => item.latencyMs)),
      codeSwitchPreservation: average(items.map((item) => item.codeSwitchScore)),
      legalEntityAccuracy: average(items.map((item) => item.legalEntityAccuracy)),
      downstreamTaskSuccess: average(
        items.map((item) =>
          item.downstreamTaskSuccess === null ? null : item.downstreamTaskSuccess ? 1 : 0,
        ),
      ),
    };
  });
}

export function bestMeasured(
  rows: BenchmarkAggregate[],
  category: BenchmarkAggregate["category"],
  metric:
    | "wer"
    | "cer"
    | "averageLatencyMs"
    | "codeSwitchPreservation"
    | "legalEntityAccuracy"
    | "downstreamTaskSuccess",
  direction: "lowest" | "highest",
) {
  const candidates = rows.filter(
    (row) => row.category === category && row.successfulSamples && row[metric] !== null,
  );
  if (!candidates.length) return { value: null as number | null, winners: [] as string[] };
  const values = candidates.map((row) => row[metric] as number),
    value = direction === "lowest" ? Math.min(...values) : Math.max(...values);
  return {
    value,
    winners: candidates
      .filter((row) => Math.abs((row[metric] as number) - value) < 1e-12)
      .map((row) => row.model),
  };
}

export function withHumanReview(
  record: BenchmarkRecord,
  review: {
    intentSuccess: boolean | null;
    retrievalSuccess: boolean | null;
    groundedAnswerSuccess: boolean | null;
    citationSuccess: boolean | null;
    reviewNotes: string;
  },
): BenchmarkRecord {
  const checks = [
    review.intentSuccess,
    review.retrievalSuccess,
    review.groundedAnswerSuccess,
    review.citationSuccess,
  ];
  return {
    ...record,
    ...review,
    downstreamTaskSuccess: checks.some((value) => value === null)
      ? null
      : checks.every((value) => value === true),
  };
}
