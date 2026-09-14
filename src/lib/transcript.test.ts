import assert from "node:assert/strict";
import test from "node:test";
import { getDamiLanguage } from "./languages.ts";
import { buildVoiceTranscript, normalizeRetrievalQuery } from "./transcript.ts";

test("retrieval normalization removes only the wake phrase and spacing", () => {
  assert.equal(
    normalizeRetrievalQuery(" Hey Dami, biko explain tenancy law "),
    "biko explain tenancy law",
  );
});

test("voice metadata preserves the original mixed-language transcript", () => {
  const original = "Biko explain section 36 make I understand am";
  const transcript = buildVoiceTranscript(original, "sahara-stt", getDamiLanguage("ig"), 250, "r1");
  assert.equal(transcript.originalTranscript, original);
  assert.equal(transcript.engine, "sahara-stt");
  assert.deepEqual(transcript.expectedLanguages, ["Igbo", "English"]);
});

test("competition language selectors use only documented Sahara codes", () => {
  assert.deepEqual(
    ["en", "ig", "pcm"].map((code) => getDamiLanguage(code).saharaSttLanguage),
    ["en", "ig", "pcm"],
  );
});
