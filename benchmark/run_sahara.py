#!/usr/bin/env python3
"""Run Intron Sahara v2.5 on every audio sample in benchmark/manifest.csv.

Requirements:
- Set INTRON_API_KEY in the environment.
- Put permitted audio files at the manifest audio_path locations.
- Keep each file <= 120 seconds for the synchronous endpoint.

The script appends/replaces Sahara rows in benchmark/results.csv and never prints
or writes the API key.
"""
import argparse
import csv
import json
import mimetypes
import os
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

DEFAULT_URL = os.environ.get("SAHARA_STT_SYNC_URL", "https://infer.voice.intron.io/file/v1/upload/sync")
MODEL_NAME = "Intron Sahara v2.5"

LANGUAGE_CODES = {
    "afrikaans-english": "af",
    "akan-english": "ak",
    "amharic-english": "am",
    "hausa-english": "ha",
    "igbo-english": "ig",
    "luganda-english": "lg",
    "pidgin-english": "pcm",
    "nigerian pidgin-english": "pcm",
    "kinyarwanda-english-french": "rw",
    "swahili-english": "sw",
    "wolof-english": "wo",
    "yoruba-english": "yo",
    "zulu-english": "zu",
    "english": "en",
}

RESULT_FIELDS = [
    "sample_id", "model", "reference_transcript", "hypothesis_transcript",
    "latency_ms", "audio_duration_ms", "legal_terms", "code_switch_tokens",
]

def language_code(value):
    cleaned = (value or "").strip().lower().replace("↔", "-").replace("/", "-")
    if cleaned in LANGUAGE_CODES:
        return LANGUAGE_CODES[cleaned]
    if "-" in cleaned:
        first = cleaned.split("-", 1)[0].strip()
        for label, code in LANGUAGE_CODES.items():
            if label.startswith(first + "-"):
                return code
    return cleaned if 1 < len(cleaned) <= 5 else "en"

def multipart(fields, file_field, file_path):
    boundary = "----DamiBenchmark" + uuid.uuid4().hex
    chunks = []
    for name, value in fields.items():
        chunks += [
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            str(value).encode("utf-8"),
            b"\r\n",
        ]
    mime = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    chunks += [
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="{file_field}"; filename="{file_path.name}"\r\n'.encode(),
        f"Content-Type: {mime}\r\n\r\n".encode(),
        file_path.read_bytes(),
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"

def transcribe(path, language, api_key, url):
    body, content_type = multipart(
        {
            "audio_file_name": path.name,
            "use_language_asr_input": language,
            "use_disable_llm_corrections": "TRUE",
        },
        "audio_file_blob",
        path,
    )
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": content_type},
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=150) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"Sahara HTTP {exc.code}: {detail}") from exc
    latency_ms = round((time.perf_counter() - started) * 1000)
    data = payload.get("data") or {}
    transcript = (data.get("audio_transcript") or data.get("transcript") or "").strip()
    if not transcript:
        raise RuntimeError(f"Sahara returned no transcript: {json.dumps(payload)[:1000]}")
    duration_ms = ""
    if data.get("processed_audio_duration_in_seconds") is not None:
        duration_ms = round(float(data["processed_audio_duration_in_seconds"]) * 1000)
    return transcript, latency_ms, duration_ms

def load_rows(path):
    if not path.exists():
        return []
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))

def write_results(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=RESULT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="benchmark/manifest.csv")
    parser.add_argument("--results", default="benchmark/results.csv")
    parser.add_argument("--limit", type=int, default=0, help="0 means all manifest rows")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    api_key = os.environ.get("INTRON_API_KEY", "")
    if not api_key and not args.dry_run:
        raise SystemExit("INTRON_API_KEY is not set. Add it to your local environment; never commit it.")

    manifest_path = Path(args.manifest)
    results_path = Path(args.results)
    manifest = load_rows(manifest_path)
    if not manifest:
        raise SystemExit(f"No benchmark samples found in {manifest_path}. Populate the manifest first.")

    if args.limit > 0:
        manifest = manifest[:args.limit]

    existing = load_rows(results_path)
    target_ids = {r["sample_id"] for r in manifest}
    kept = [r for r in existing if not (r.get("model") == MODEL_NAME and r.get("sample_id") in target_ids)]

    completed = []
    for i, sample in enumerate(manifest, 1):
        audio = Path(sample["audio_path"])
        code = language_code(sample.get("language_pair", "en"))
        print(f"[{i}/{len(manifest)}] {sample['sample_id']} -> Sahara ({code})")
        if args.dry_run:
            if not audio.exists():
                print(f"  MISSING: {audio}")
            else:
                print(f"  ready: {audio}")
            continue
        if not audio.exists():
            raise SystemExit(f"Audio file not found: {audio}")

        transcript, latency_ms, duration_ms = transcribe(audio, code, api_key, args.url)
        completed.append({
            "sample_id": sample["sample_id"],
            "model": MODEL_NAME,
            "reference_transcript": sample["reference_transcript"],
            "hypothesis_transcript": transcript,
            "latency_ms": latency_ms,
            "audio_duration_ms": duration_ms,
            "legal_terms": sample.get("legal_terms", ""),
            "code_switch_tokens": sample.get("code_switch_tokens", ""),
        })
        # The sync endpoint is documented at 30 req/min. Stay comfortably below it.
        if i < len(manifest):
            time.sleep(2.1)

    if not args.dry_run:
        write_results(results_path, kept + completed)
        print(f"Wrote {len(completed)} Sahara result rows to {results_path}")

if __name__ == "__main__":
    main()
