# Dami Code-Switch ASR Benchmark

This folder contains the reproducible benchmark required for the Sahara CodeSwitch Africa Challenge. No benchmark score is entered until it is measured from real model output.

## Models

Run the same audio against:
1. Intron Sahara v2.5 (required)
2. OpenAI Whisper / Whisper-compatible model
3. NVIDIA Nemotron-ASR or another available multilingual ASR
4. One additional global, local, commercial, pretrained, or open-source ASR

This four-model plan satisfies the submission requirement to compare Sahara with at least three other speech models.

## Test set

Use consented or appropriately licensed legal/public-service utterances. Prefer natural code-switching. For every sample record:
- sample_id
- audio path
- reference transcript
- language pair
- legal/public-service domain
- accent/country
- device type
- noise condition
- consent/license/source note
- optional legal_terms separated with |
- optional code_switch_tokens separated with |

Do not commit private or non-consensual recordings.

The official Sahara language table currently marks code-switched support for Afrikaans-English, Akan-English, Amharic-English, Hausa-English, Igbo-English, Luganda-English, Pidgin-English, Kinyarwanda-English-French, Swahili-English, Wolof-English, Yoruba-English and Zulu-English.

## Metrics

- WER: (substitutions + deletions + insertions) / reference words
- CER: same calculation at character level
- legal-term accuracy: correctly transcribed target legal terms / target legal terms
- code-switch token accuracy: correctly transcribed switched-language target tokens / switched-language target tokens
- latency_ms: request start to final transcript
- real-time factor when audio duration is known

Normalize Unicode and whitespace before scoring. Preserve meaningful words; do not alter a model transcript to make its score better.

## Run Sahara

Set the restored Intron key only in your shell/environment:

```bash
# PowerShell
$env:INTRON_API_KEY="your-key"

# Check paths without spending credits
python benchmark/run_sahara.py --dry-run

# Small credit-safe smoke test
python benchmark/run_sahara.py --limit 3

# Full Sahara benchmark
python benchmark/run_sahara.py
```

The runner uses Intron's synchronous file endpoint, disables LLM transcript corrections for fair raw-ASR comparison, maps supported code-switched language pairs to Sahara language codes, records latency, and stays under the documented synchronous rate limit.

## Score

```bash
python benchmark/score.py benchmark/results.csv
```

Do not commit the Intron key. Do not replace missing measurements with estimates.
