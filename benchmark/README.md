# Dami Code-Switch ASR Benchmark

This folder contains the reproducible benchmark required for the Sahara CodeSwitch Africa Challenge. No benchmark score is entered until it is measured from real model output.

## Required comparison

Run identical audio through four systems:

1. **Intron Sahara v2.5** — required challenge model
2. **faster-whisper large-v3** — global/open Whisper baseline
3. **A code-switch/African ASR model** through `run_hf_asr.py`
4. **A second independent ASR model** through `run_hf_asr.py` or another documented provider

This satisfies the submission requirement to compare Sahara against at least three other speech models.

## Test audio

Preferred benchmark source: **intronhealth/AfriSwitch**, an evaluation-only, human-transcribed code-switch benchmark released under **CC BY-NC-SA 4.0**. The repository is gated on Hugging Face, so the participant must accept its access conditions before downloading it.

For Dami, prioritize Yoruba-English, Igbo-English, Hausa-English, Pidgin-English, Akan-English or Swahili-English samples, with a legal/public-service supplemental set where consent/license permits.

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

# Two additional Hugging Face ASR models; replace IDs with the final selected models
python benchmark/run_hf_asr.py MODEL_ID_1
python benchmark/run_hf_asr.py MODEL_ID_2
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
