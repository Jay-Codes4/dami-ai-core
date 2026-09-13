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

Desktop voice turns support click-to-interrupt follow-ups, automatic recovery from temporary Sahara session allocation failures, and tray controls for talking or pausing the wake listener.

Windows installation, browser-download warnings, SmartScreen steps, microphone permissions, and the judge test flow are documented in [`INSTALL_WINDOWS.md`](INSTALL_WINDOWS.md).

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

The Sahara streaming gateway follows the documented session flow: connect, wait for `SESSION_CREATED`, stream audio chunks, commit, and receive the final transcript.

## Benchmark Results

The challenge requires code-switched ASR benchmarking. Dami's reproducible framework is in [`benchmark/`](benchmark/).

The comparison is designed for Sahara plus three other speech models on identical audio. It records WER, CER, legal-term accuracy, code-switch token accuracy, latency, language pair, accent/country, device, and noise condition.

Intron credits have been restored, so the Sahara execution path is ready. Actual benchmark rows remain empty until permitted test audio is added to `benchmark/manifest.csv` and the models are run; no result is estimated or fabricated.

Run a Sahara smoke test with:

```bash
$env:INTRON_API_KEY="your-key"
python benchmark/run_sahara.py --limit 3
python benchmark/score.py benchmark/results.csv
```

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
- [x] Sahara credits restored / benchmark runner ready
- [ ] Add permitted code-switched benchmark audio + reference transcripts
- [ ] Populate measured results for Sahara + three comparison models
- [ ] Record final short prototype demo video

## Repository Map

```text
api/                 server-side speech endpoints
voice-gateway/       Sahara streaming WebSocket gateway
desktop/             Electron desktop companion
src/                 Dami web application and legal agent
benchmark/           benchmark manifest, model runners, result schema and scorer
RESPONSIBLE_AI.md    privacy, consent, safety and responsible-use note
```

## Security

No production secret belongs in this repository. `.env` files, private keys, credentials, and generated installers are ignored. Deployment credentials are environment variables and repository secret scanning is enabled.

---

**Dami AI — A Voice for Justice.**
