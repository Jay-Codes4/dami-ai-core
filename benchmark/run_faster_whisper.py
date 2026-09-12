#!/usr/bin/env python3
import argparse, csv, time
from pathlib import Path
from faster_whisper import WhisperModel

FIELDS=["sample_id","model","reference_transcript","hypothesis_transcript","latency_ms","audio_duration_ms","legal_terms","code_switch_tokens"]

def rows(path):
    with open(path,encoding="utf-8",newline="") as f:return list(csv.DictReader(f))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--manifest",default="benchmark/manifest.csv")
    p.add_argument("--results",default="benchmark/results.csv")
    p.add_argument("--model",default="large-v3")
    p.add_argument("--device",default="auto")
    p.add_argument("--compute-type",default="default")
    p.add_argument("--limit",type=int,default=0)
    a=p.parse_args()
    manifest=rows(a.manifest)
    if a.limit:manifest=manifest[:a.limit]
    if not manifest:raise SystemExit("Benchmark manifest is empty.")
    model=WhisperModel(a.model,device=a.device,compute_type=a.compute_type)
    name=f"faster-whisper {a.model}"
    existing=rows(a.results)
    ids={x["sample_id"] for x in manifest}
    existing=[x for x in existing if not(x.get("model")==name and x.get("sample_id") in ids)]
    out=[]
    for i,s in enumerate(manifest,1):
        path=Path(s["audio_path"])
        if not path.exists():raise SystemExit(f"Missing audio: {path}")
        print(f"[{i}/{len(manifest)}] {s['sample_id']} -> {name}")
        started=time.perf_counter()
        segments,info=model.transcribe(str(path),beam_size=5,vad_filter=True)
        text=" ".join(seg.text.strip() for seg in segments).strip()
        latency=round((time.perf_counter()-started)*1000)
        out.append({
            "sample_id":s["sample_id"],"model":name,
            "reference_transcript":s["reference_transcript"],
            "hypothesis_transcript":text,"latency_ms":latency,
            "audio_duration_ms":round(float(getattr(info,"duration",0) or 0)*1000) or "",
            "legal_terms":s.get("legal_terms",""),
            "code_switch_tokens":s.get("code_switch_tokens",""),
        })
    with open(a.results,"w",encoding="utf-8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=FIELDS);w.writeheader();w.writerows(existing+out)
    print(f"Wrote {len(out)} rows for {name}.")

if __name__=="__main__":main()
