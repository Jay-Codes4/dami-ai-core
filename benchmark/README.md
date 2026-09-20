# Dami Code-Switch ASR Benchmark

This folder contains the reproducible benchmark required for the Sahara CodeSwitch Africa Challenge. No benchmark score is entered until it is measured from real model output.

## Required comparison

Run identical audio through three systems:

1. **Intron Sahara v2.5** — required challenge model
2. **faster-whisper large-v3** — global/open Whisper baseline
3. **Meta MMS 1B All** — multilingual/African-language baseline through `run_mms.py`

The public `/benchmark` route mirrors this three-model comparison and also runs every successful transcript through Dami's legal agent. `run_hf_asr.py` remains available for optional additional models.

## Test audio

Preferred benchmark source: **intronhealth/AfriSwitch**, an evaluation-only, human-transcribed code-switch benchmark released under **CC BY-NC-SA 4.0**. The repository is gated on Hugging Face, so the participant must accept its access conditions before downloading it.

For Dami, use English, Igbo, Nigerian Pidgin, English-Igbo, English-Pidgin, Igbo-Pidgin and English-Igbo-Pidgin samples, with a legal/public-service supplemental set where consent/license permits.

Suggested initial distribution: English 3, Igbo 3, Pidgin 3, English-Igbo 7, English-Pidgin 5, Igbo-Pidgin 3 and three-language 6 (30 total). The tools support any sample count.

For every sample in `manifest.csv`, record:

- sample_id and local audio_path
- reference transcript
- language pair
- domain
- accent/country if known
- device/noise metadata if known
- consent/license/source note
- optional legal terms and switched tokens separated with `|`

Do not commit private or non-consensual recordings.

## Install comparison runners

```bash
python -m pip install -r benchmark/requirements.txt
```

## Run Sahara

Keep the restored Intron key only in your environment:

```powershell
$env:INTRON_API_KEY="your-key"

# Validate manifest without spending credits
python benchmark/run_sahara.py --dry-run

# Credit-safe smoke test
python benchmark/run_sahara.py --limit 3

# Full Sahara pass
python benchmark/run_sahara.py
```

The Sahara runner uses the documented synchronous endpoint, disables LLM transcript corrections for fair raw-ASR comparison, maps supported code-switch language pairs to Sahara language codes, records latency, and stays below the documented 30 requests/minute sync limit.

## Run comparison models

```bash
# Global Whisper baseline
python benchmark/run_faster_whisper.py --model large-v3

# Selected multilingual/African baseline
python benchmark/run_mms.py

# Optional fourth model
python benchmark/run_hf_asr.py MODEL_ID
```

Use the **same manifest and audio files for every model**. Record model/version, hardware and any decoding settings in the final report.

## Metrics

`score.py` calculates:

- WER
- CER
- legal-term accuracy
- code-switch token accuracy
- mean latency
- mean real-time factor when duration is available

```bash
python benchmark/score.py benchmark/results.csv
```

Do not edit hypotheses to improve scores. Do not estimate missing measurements.

## Browser benchmark

Open `/benchmark`, record or upload a permitted sample, provide the exact reference transcript, then run and review the comparison. No admin password or access token is required; provider credentials remain server-side.

The browser stores only result records in local storage; it does not persist uploaded/recorded audio. Provider failures receive null metrics and remain visible. CSV and JSON exports include raw transcripts, SHA-256 audio identity, WER/CER, latency, code-switch/entity scores, downstream legal-task checks, citations, notes and timestamps.

Meta MMS uses one adapter at a time (`eng`, `ibo` or `pcm`). For mixed samples the African-language adapter is recorded; the report must not describe MMS as simultaneous code-switch ASR. Sahara documents `ig` for Igbo-English and `pcm` for Pidgin-English, but not an Igbo-Pidgin/trilingual code. Dami marks those combinations experimental and never invents an `AUTO` language code.
