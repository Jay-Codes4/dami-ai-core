import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateBenchmark,
  buildBenchmarkRecord,
  calculateErrorRates,
  normalizeBenchmarkText,
  preservationScore,
  withHumanReview,
} from "./benchmark.ts";

test("WER and CER are calculated from normalized Unicode text", () => {
  const rates = calculateErrorRates("anyị have rights", "anyị get rights");
  assert.equal(rates.wordEdits, 1);
  assert.equal(rates.wer, 1 / 3);
  assert.equal(normalizeBenchmarkText("  Ńdị! "), "ńdị");
});

test("token preservation is deterministic and phrase-aware", () => {
  const result = preservationScore(["biko", "section 36"], "Biko explain section 36");
  assert.equal(result.score, 1);
});

test("failed providers never receive invented metric scores", () => {
  const rows = aggregateBenchmark([]);
  assert.deepEqual(rows, []);
});

const response = {
  testId: "EN-IG-001",
  audioId: "audio-1",
  audioSha256: "abc",
  durationMs: 1000,
  languageCategory: "English + Igbo" as const,
  referenceTranscript: "biko explain section 36",
  configurationNote: "Sahara ig",
  results: [],
};

test("aggregate WER is weighted by reference word count", () => {
  const first = buildBenchmarkRecord({
      response,
      asr: {
        modelId: "sahara",
        model: "Sahara",
        status: "complete",
        generatedTranscript: "biko explain section 36",
        latencyMs: 800,
        configuration: "ig",
        error: "",
      },
      codeSwitchTokens: ["biko"],
      criticalEntities: ["section 36"],
    }),
    second = buildBenchmarkRecord({
      response: { ...response, testId: "EN-IG-002", referenceTranscript: "one two" },
      asr: {
        modelId: "sahara",
        model: "Sahara",
        status: "complete",
        generatedTranscript: "one three",
        latencyMs: 1000,
        configuration: "ig",
        error: "",
      },
      codeSwitchTokens: [],
      criticalEntities: [],
    });
  const overall = aggregateBenchmark([first, second]).find((row) => row.category === "Overall");
  assert.equal(overall?.wer, 1 / 6);
});

test("overall downstream result waits for transparent human review", () => {
  const record = buildBenchmarkRecord({
    response,
    asr: {
      modelId: "sahara",
      model: "Sahara",
      status: "complete",
      generatedTranscript: response.referenceTranscript,
      latencyMs: 700,
      configuration: "ig",
      error: "",
    },
    codeSwitchTokens: ["biko"],
    criticalEntities: ["section 36"],
  });
  assert.equal(record.downstreamTaskSuccess, null);
  assert.equal(
    withHumanReview(record, {
      intentSuccess: true,
      retrievalSuccess: true,
      groundedAnswerSuccess: true,
      citationSuccess: true,
      reviewNotes: "Reviewed against the reference.",
    }).downstreamTaskSuccess,
    true,
  );
});
