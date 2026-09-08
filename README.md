# Dami AI — A Voice for Justice

> Voice-first African legal research for the Sahara CodeSwitch Africa Challenge.

Dami lets a user speak a legal question naturally, including supported African code-switching, then performs the downstream task: jurisdiction-aware legal research, source retrieval, legal reasoning, citations, and a spoken response.

## Problem & Solution

Legal information can be difficult to search and understand, especially when the person asking is more comfortable speaking or naturally mixes English with an African language. Generic speech systems can lose legal terminology and code-switched words.

Dami combines Sahara speech recognition with a source-grounded legal research agent. Voice is not the endpoint: the transcript triggers research and produces an actionable, cited legal-information response.

**Track:** Legal & Public Services.

## Working Prototype

Web application: `https://dami-ai-core.vercel.app`

Core flow:

```text
Voice → Sahara STT → legal research/search → legal reasoning → cited answer → Sahara TTS
```

Dami also ships as a Windows Electron companion. Installed Dami floats on the desktop and supports hands-free **“Hey Dami”** activation. The Windows build uses a narrow OS speech grammar for the wake phrase and then starts Dami's normal voice workflow; clicking the avatar remains a fallback, not a requirement.

Current launch language set: English, Akan↔English, Yoruba↔English, Swahili↔English, and Nigerian Pidgin↔English.

## Code & Technical Notes

- React + TypeScript + TanStack Start
- Vercel web deployment
- Electron Windows desktop companion
- Sahara STT streaming gateway with server-side Authorization
- Sahara TTS server proxy
- Exa live source retrieval
- Groq legal reasoning
- Server-side secrets only; no API keys in client bundles
- Voice states: listening → transcribing → researching → speaking
- Source-grounded legal answers with jurisdiction awareness

The Sahara streaming gateway is implemented according to the session flow: connect, wait for `SESSION_CREATED`, stream audio chunks, commit, and receive the final transcript. At the time of this README update, the competition Sahara account reports `QUOTA_EXCEEDED` with a zero credit balance, so final Sahara voice/benchmark execution is pending credit restoration rather than being represented with invented results.

## Benchmark Results

The challenge requires code-switched ASR benchmarking. Dami's reproducible framework is in [`benchmark/`](benchmark/).

The final comparison is designed for Sahara plus three other speech models on identical audio. It records WER, CER, legal-term accuracy, code-switch token accuracy, latency, language pair, accent/country, device, and noise condition.

Run scoring with:

```bash
python benchmark/score.py benchmark/results.csv
```

`benchmark/results.csv` intentionally contains no fabricated scores. Actual model outputs are entered only after each model is run against the same permitted test set.

## Responsible AI

See [`RESPONSIBLE_AI.md`](RESPONSIBLE_AI.md).

Dami's submission approach covers privacy and consent, legal safety, source integrity, speech-model limitations, inclusion/fairness, data minimization, and human responsibility. Dami provides legal information and research assistance; it does not claim to replace a lawyer or authoritative legal advice.

## Challenge Submission Checklist

- [x] Specific real-world vertical: Legal & Public Services
- [x] Voice drives a downstream legal-research task
- [x] Working web prototype
- [x] Windows desktop companion
- [x] Hands-free “Hey Dami” desktop activation
- [x] Code and technical documentation
- [x] Reproducible benchmark framework
- [x] Responsible AI note
- [ ] Populate measured benchmark results after model runs / Sahara credit restoration
- [ ] Record final short prototype demo video

## Repository Map

```text
api/                 server-side speech endpoints
voice-gateway/       Sahara streaming WebSocket gateway
desktop/             Electron desktop companion
src/                 Dami web application and legal agent
benchmark/           benchmark manifest, result schema and scorer
RESPONSIBLE_AI.md    privacy, consent, safety and responsible-use note
```

## Security

No production secret belongs in this repository. `.env` files, private keys, credentials, and generated installers are ignored. Deployment credentials are environment variables and repository secret scanning is enabled.

---

**Dami AI — A Voice for Justice.**
