#!/usr/bin/env python3
"""Run Meta MMS 1B All on Dami's identical-audio benchmark manifest.

MMS uses one language adapter at a time. For mixed samples this runner selects
the African-language adapter declared by the category and records that setting;
it does not claim native simultaneous code-switch decoding.
"""
import argparse
import csv
import time
from pathlib import Path

import torch
import torchaudio
from transformers import AutoProcessor, Wav2Vec2ForCTC

MODEL_ID = "facebook/mms-1b-all"
MODEL_NAME = "Meta MMS 1B All"
FIELDS = [
    "sample_id", "model", "reference_transcript", "hypothesis_transcript",
    "latency_ms", "audio_duration_ms", "legal_terms", "code_switch_tokens",
]


def rows(path):
    with open(path, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def adapter_for(value):
    category = (value or "").lower()
    if "igbo" in category:
        return "ibo"
    if "pidgin" in category or "pcm" in category:
        return "pcm"
    return "eng"


def load_audio(path):
    waveform, sample_rate = torchaudio.load(path)
    waveform = waveform.mean(dim=0)
    if sample_rate != 16_000:
        waveform = torchaudio.functional.resample(waveform, sample_rate, 16_000)
    return waveform, round((waveform.numel() / 16_000) * 1000)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="benchmark/manifest.csv")
    parser.add_argument("--results", default="benchmark/results.csv")
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    manifest = rows(args.manifest)
    if args.limit:
        manifest = manifest[: args.limit]
    if not manifest:
        raise SystemExit("Benchmark manifest is empty.")

    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model = Wav2Vec2ForCTC.from_pretrained(MODEL_ID).to(args.device)
    model.eval()
    active_adapter = None
    completed = []
    for index, sample in enumerate(manifest, 1):
        audio_path = Path(sample["audio_path"])
        if not audio_path.exists():
            raise SystemExit(f"Missing audio: {audio_path}")
        adapter = adapter_for(sample.get("language_pair"))
        if adapter != active_adapter:
            model.load_adapter(adapter)
            processor.tokenizer.set_target_lang(adapter)
            active_adapter = adapter
        print(f"[{index}/{len(manifest)}] {sample['sample_id']} -> {MODEL_NAME} ({adapter})")
        waveform, duration_ms = load_audio(audio_path)
        started = time.perf_counter()
        inputs = processor(waveform.numpy(), sampling_rate=16_000, return_tensors="pt")
        with torch.no_grad():
            logits = model(inputs.input_values.to(args.device)).logits
        transcript = processor.batch_decode(torch.argmax(logits, dim=-1).cpu())[0].strip()
        completed.append({
            "sample_id": sample["sample_id"],
            "model": f"{MODEL_NAME} [{adapter}]",
            "reference_transcript": sample["reference_transcript"],
            "hypothesis_transcript": transcript,
            "latency_ms": round((time.perf_counter() - started) * 1000),
            "audio_duration_ms": duration_ms,
            "legal_terms": sample.get("legal_terms", ""),
            "code_switch_tokens": sample.get("code_switch_tokens", ""),
        })

    existing = rows(args.results)
    sample_ids = {sample["sample_id"] for sample in manifest}
    existing = [
        row for row in existing
        if not (row.get("model", "").startswith(MODEL_NAME) and row.get("sample_id") in sample_ids)
    ]
    with open(args.results, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(existing + completed)
    print(f"Wrote {len(completed)} measured rows for {MODEL_NAME}.")


if __name__ == "__main__":
    main()
