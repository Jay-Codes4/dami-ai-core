#!/usr/bin/env python3
"""Generic Hugging Face ASR runner so Dami can benchmark additional models on identical audio."""
import argparse, csv, time
from pathlib import Path
from transformers import pipeline

FIELDS=["sample_id","model","reference_transcript","hypothesis_transcript","latency_ms","audio_duration_ms","legal_terms","code_switch_tokens"]

def rows(path):
    with open(path,encoding="utf-8",newline="") as f:return list(csv.DictReader(f))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("model",help="Hugging Face model id")
    p.add_argument("--manifest",default="benchmark/manifest.csv")
    p.add_argument("--results",default="benchmark/results.csv")
    p.add_argument("--device",default=None,help="e.g. 0 for first GPU or -1 for CPU")
    p.add_argument("--limit",type=int,default=0)
    a=p.parse_args()
    manifest=rows(a.manifest)
    if a.limit:manifest=manifest[:a.limit]
    if not manifest:raise SystemExit("Benchmark manifest is empty.")
    device=int(a.device) if a.device is not None else -1
    asr=pipeline("automatic-speech-recognition",model=a.model,device=device)
    existing=rows(a.results)
    ids={x["sample_id"] for x in manifest}
    existing=[x for x in existing if not(x.get("model")==a.model and x.get("sample_id") in ids)]
    out=[]
    for i,s in enumerate(manifest,1):
        path=Path(s["audio_path"])
        if not path.exists():raise SystemExit(f"Missing audio: {path}")
        print(f"[{i}/{len(manifest)}] {s['sample_id']} -> {a.model}")
        started=time.perf_counter()
        result=asr(str(path))
        latency=round((time.perf_counter()-started)*1000)
        text=(result.get("text") if isinstance(result,dict) else str(result)).strip()
        out.append({
            "sample_id":s["sample_id"],"model":a.model,
            "reference_transcript":s["reference_transcript"],
            "hypothesis_transcript":text,"latency_ms":latency,
            "audio_duration_ms":"",
            "legal_terms":s.get("legal_terms",""),
            "code_switch_tokens":s.get("code_switch_tokens",""),
        })
    with open(a.results,"w",encoding="utf-8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows(existing+out)
    print(f"Wrote {len(out)} rows for {a.model}.")

if __name__=="__main__":main()
