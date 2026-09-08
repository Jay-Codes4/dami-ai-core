# Dami Code-Switch ASR Benchmark

This folder contains the reproducible benchmark required for the Sahara CodeSwitch Africa Challenge. No benchmark score is entered until it is measured from real model output.

## Models

Run the same audio against:
1. Intron Sahara (required)
2. OpenAI Whisper / Whisper-compatible model
3. NVIDIA Nemotron-ASR or another available multilingual ASR
4. One additional global, local, commercial, pretrained, or open-source ASR

This four-model plan intentionally exceeds the challenge task's minimum of Sahara + two others and satisfies the submission section asking for Sahara compared with at least three other speech models.

## Test set

Use consented or appropriately licensed legal/public-service utterances. Prefer natural code-switching. For every sample record:
- sample_id
- reference transcript
- language pair
- legal/public-service domain
- accent/country
- device type
- noise condition
- consent/license/source note

Do not commit private or non-consensual recordings.

## Metrics

- WER: (substitutions + deletions + insertions) / reference words
- CER: same calculation at character level
- legal-term accuracy: correctly transcribed target legal terms / target legal terms
- code-switch token accuracy: correctly transcribed switched-language target tokens / switched-language target tokens
- latency_ms: request start to final transcript
- real-time factor when audio duration is known

Normalize Unicode and whitespace before scoring. Preserve meaningful words; do not alter a model transcript to make its score better.

## Files

`manifest.csv` — sample metadata and references.
`results.csv` — one row per sample/model result.
`score.py` — dependency-free WER/CER aggregation.

## Run

```bash
python benchmark/score.py benchmark/results.csv
```

Sahara currently cannot be executed because the competition account reports `QUOTA_EXCEEDED` / zero credits. This is an execution dependency, not a reason to invent results. Run the Sahara column as soon as credits are restored.
