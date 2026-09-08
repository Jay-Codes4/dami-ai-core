$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'Dami\voice\yarngpt'
$venv = Join-Path $root '.venv'
New-Item -ItemType Directory -Force -Path $root | Out-Null

if (-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw 'Python 3.10+ is required for the optional YarnGPT local Nigerian voice.'
}
$python = if (Get-Command py -ErrorAction SilentlyContinue) { 'py' } else { 'python' }
if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) {
  & $python -m venv $venv
}
$vp = Join-Path $venv 'Scripts\python.exe'
& $vp -m pip install --upgrade pip
& $vp -m pip install torch torchaudio transformers outetts uroman inflect numpy huggingface_hub gdown

$src = Join-Path $root 'yarngpt-src'
if (-not (Test-Path $src)) {
  Invoke-WebRequest -Uri 'https://github.com/saheedniyi02/yarngpt/archive/refs/heads/main.zip' -OutFile (Join-Path $root 'yarngpt.zip')
  Expand-Archive (Join-Path $root 'yarngpt.zip') -DestinationPath $root -Force
  Rename-Item (Join-Path $root 'yarngpt-main') $src
}
$config = Join-Path $root 'wavtokenizer.yaml'
if (-not (Test-Path $config)) {
  Invoke-WebRequest -Uri 'https://huggingface.co/novateur/WavTokenizer-medium-speech-75token/resolve/main/wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml' -OutFile $config
}
$checkpoint = Join-Path $root 'wavtokenizer_large_speech_320_24k.ckpt'
if (-not (Test-Path $checkpoint)) {
  & $vp -m gdown '1-ASeEkrn4HY49yZWHTASgfGFNXdVnLTt' -O $checkpoint
}
# Warm/download the YarnGPT model once so normal speech can run offline afterwards.
& $vp -c "from transformers import AutoTokenizer,AutoModelForCausalLM; AutoTokenizer.from_pretrained('saheedniyi/YarnGPT2'); AutoModelForCausalLM.from_pretrained('saheedniyi/YarnGPT2')"
Set-Content -Path (Join-Path $root 'READY') -Value 'idera' -Encoding ascii
Write-Output 'DAMI_YARNGPT_READY'
