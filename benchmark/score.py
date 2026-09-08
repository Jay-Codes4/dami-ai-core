#!/usr/bin/env python3
import csv, re, sys, unicodedata
from collections import defaultdict

def norm(s):
    s=unicodedata.normalize('NFKC',s or '').lower()
    s=re.sub(r'[^\w\s\'-]',' ',s,flags=re.UNICODE)
    return re.sub(r'\s+',' ',s).strip()

def edits(ref,hyp):
    n,m=len(ref),len(hyp); d=list(range(m+1))
    for i in range(1,n+1):
        prev=d; d=[i]+[0]*m
        for j in range(1,m+1): d[j]=min(prev[j]+1,d[j-1]+1,prev[j-1]+(ref[i-1]!=hyp[j-1]))
    return d[m]

def accuracy(targets,hyp):
    t=[norm(x) for x in (targets or '').split('|') if norm(x)]
    if not t:return None
    h=norm(hyp)
    return sum(1 for x in t if re.search(r'(?<!\w)'+re.escape(x)+r'(?!\w)',h))/len(t)

def main(path):
    agg=defaultdict(lambda:{'we':0,'wn':0,'ce':0,'cn':0,'lat':[],'rtf':[],'legal':[],'switch':[],'n':0})
    with open(path,encoding='utf-8',newline='') as f:
        for r in csv.DictReader(f):
            if not r.get('model') or not r.get('reference_transcript') or not r.get('hypothesis_transcript'):continue
            a=agg[r['model']]; rw=norm(r['reference_transcript']).split(); hw=norm(r['hypothesis_transcript']).split(); rc=list(norm(r['reference_transcript'])); hc=list(norm(r['hypothesis_transcript']))
            a['we']+=edits(rw,hw);a['wn']+=len(rw);a['ce']+=edits(rc,hc);a['cn']+=len(rc);a['n']+=1
            try:a['lat'].append(float(r['latency_ms']))
            except:pass
            try:
                dur=float(r['audio_duration_ms']); lat=float(r['latency_ms']);
                if dur>0:a['rtf'].append(lat/dur)
            except:pass
            for key,col in [('legal','legal_terms'),('switch','code_switch_tokens')]:
                v=accuracy(r.get(col,''),r['hypothesis_transcript'])
                if v is not None:a[key].append(v)
    print('model,samples,wer,cer,legal_term_accuracy,code_switch_token_accuracy,mean_latency_ms,mean_rtf')
    for model,a in sorted(agg.items()):
        avg=lambda xs: sum(xs)/len(xs) if xs else float('nan')
        print(f"{model},{a['n']},{a['we']/max(a['wn'],1):.4f},{a['ce']/max(a['cn'],1):.4f},{avg(a['legal']):.4f},{avg(a['switch']):.4f},{avg(a['lat']):.1f},{avg(a['rtf']):.4f}")

if __name__=='__main__': main(sys.argv[1] if len(sys.argv)>1 else 'benchmark/results.csv')
