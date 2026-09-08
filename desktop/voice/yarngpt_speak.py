import os, sys
from pathlib import Path

root = Path(os.environ.get('LOCALAPPDATA', '.')) / 'Dami' / 'voice' / 'yarngpt'
sys.path.insert(0, str(root / 'yarngpt-src'))
import torch, torchaudio
from transformers import AutoModelForCausalLM
from yarngpt.audiotokenizer import AudioTokenizerV2

text = sys.stdin.read().strip()
if not text:
    raise SystemExit(2)
model_id = 'saheedniyi/YarnGPT2'
audio_tokenizer = AudioTokenizerV2(model_id, str(root/'wavtokenizer_large_speech_320_24k.ckpt'), str(root/'wavtokenizer.yaml'))
model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype='auto').to(audio_tokenizer.device)
prompt = audio_tokenizer.create_prompt(text, lang='english', speaker_name='idera')
ids = audio_tokenizer.tokenize_prompt(prompt)
out = model.generate(input_ids=ids, temperature=0.1, repetition_penalty=1.1, max_length=4000)
codes = audio_tokenizer.get_codes(out)
audio = audio_tokenizer.get_audio(codes)
outfile = root / 'dami-output.wav'
torchaudio.save(str(outfile), audio, sample_rate=24000)
print(str(outfile))
