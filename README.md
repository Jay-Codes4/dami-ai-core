# Dami AI — A Voice for Justice

> Voice-first African legal research for the Sahara CodeSwitch Africa Challenge.

Dami AI is a voice-first, code-switching African legal AI assistant powered by Sahara speech technology. A user can speak naturally in English, Igbo, Nigerian Pidgin, or supported mixtures, and Dami turns that transcript into jurisdiction-aware legal research, source retrieval, legal reasoning, citations, and a spoken response.

## Problem & Solution

Legal information can be difficult to search and understand, especially when the person asking is more comfortable speaking or naturally mixes English with an African language. Generic speech systems can lose legal terminology and code-switched words.

Dami combines Sahara speech recognition with a source-grounded legal research agent. Voice is not the endpoint: the transcript triggers research and produces an actionable, cited legal-information response.

**Track:** Legal & Public Services.

## Working Prototype

Web application: [Open Dami AI](https://dami-ai-core.vercel.app)

Windows companion: [Download the newest Dami installer](https://github.com/Jay-Codes4/dami-ai-core/releases/latest/download/Dami-Setup.exe)

### Fast judge path

**On the web:** open **Ask Dami**, choose English, Igbo, or Nigerian Pidgin, then click or double-click Dami's avatar (or select **Talk with Dami**). Begin speaking after the rising cue. Speak naturally and code-switch inside the same sentence; Dami keeps the original mixed transcript visible. The on-screen label changes through **Dami is listening → transcribing → researching → thinking → speaking**, and the complete answer remains visible with its sources.

**On Windows:** install the latest release, wait for the floating avatar to say **Click me · or say “Hey Dami”**, then either say **“Hey Dami”** or single-click/double-click the avatar. The rising cue means the microphone is listening; the descending cue means recording ended. The status pill always shows what Dami is doing.

The real competition flow is:

```text
Microphone → Sahara STT → original code-switched transcript → normalized retrieval query → legal intent → Exa source retrieval/ranking → Groq grounded answer → citations → African female voice
```

Dami also ships as a Windows Electron companion. Installed Dami floats on the desktop and supports hands-free **“Hey Dami”** activation. The Windows build uses continuous native Windows speech recognition with an accent-tolerant wake grammar and dictation fallback, then starts Dami's normal voice workflow. Single-clicking or double-clicking the avatar is an equally supported activation method.

Desktop voice turns support click-to-interrupt follow-ups, automatic recovery from temporary Sahara session allocation failures, and tray controls for talking or pausing the wake listener.

Wake interaction supports both a two-step prompt (`Hey Dami` → listening cue → question) and a single utterance (`Hey Dami, <question>`). Distinct start and end cues make the active recording boundary unambiguous, while animated labels make listening, transcription, research, and speech visible.

Windows installation, browser-download warnings, SmartScreen steps, microphone permissions, and the judge test flow are documented in [`INSTALL_WINDOWS.md`](INSTALL_WINDOWS.md).

Competition language set: **English, Igbo and Nigerian Pidgin**. Sahara's documented `ig` and `pcm` modes cover Igbo-English and Pidgin-English code-switching without requiring the speaker to change language mid-utterance. Dami never invents an unsupported `AUTO` code. The original transcript and normalized retrieval query remain separate.

## Code & Technical Notes

- React + TypeScript + TanStack Start
- Vercel web deployment
- Electron Windows desktop companion
- Sahara STT streaming gateway with server-side Authorization
- Sahara TTS server proxy
- Exa live source retrieval
- Groq legal reasoning
- Server-side secrets only; no API keys in client bundles
- Visible voice states: listening → transcribing → researching → thinking → speaking → error/retry
- Source-grounded legal answers with jurisdiction awareness

The Sahara streaming gateway follows the documented session flow: connect, wait for `SESSION_CREATED`, stream audio chunks, commit, and receive the final transcript.

## Reproducible benchmark mode

**Judges / evaluators:** open the deployed [Dami Benchmark](https://dami-ai-core.vercel.app/benchmark) to inspect and run the reproducible ASR comparison. This evidence tool is intentionally isolated from the main Ask Dami demo so benchmark changes cannot alter the competition voice/legal workflow.

The protected benchmark interface is available at `/benchmark`. In production, execution is protected by `DAMI_BENCHMARK_ACCESS_TOKEN`; judges can inspect the methodology and published evidence without receiving provider API secrets. It can record or upload one consented sample and sends the exact same audio bytes independently and concurrently to:

1. Intron Sahara v2.5 (primary competition ASR)
2. Groq Whisper Large V3
3. Groq Whisper Large V3 Turbo

Supported benchmark categories include English, Igbo, Nigerian Pidgin, Yoruba, English + Igbo, English + Pidgin, and English + Yoruba, with the existing experimental Igbo/Pidgin combinations clearly labelled. It automatically measures Unicode-aware WER, CER and provider latency. Testers enter explicit switched words/phrases and critical legal entities; Dami scores exact normalized preservation deterministically so every score is reviewable. Each successful transcript independently enters the same Dami legal agent, and the reviewer records intent, retrieval, grounding and citation PASS/FAIL signals. Results aggregate per language category and overall, then export as CSV or JSON.

The batch framework in [`benchmark/`](benchmark/) runs the same comparison offline and supports additional models and samples. The suggested 30-sample plan intentionally emphasizes English-Igbo, English-Pidgin and three-language speech; it is not hardcoded.

Intron credits have been restored, so the Sahara execution path is ready. Actual benchmark rows remain empty until permitted test audio is added to `benchmark/manifest.csv` and the models are run; no result is estimated or fabricated.

Optional local/batch smoke-test examples:

```bash
$env:INTRON_API_KEY="your-key"
python benchmark/run_sahara.py --limit 3
python benchmark/run_faster_whisper.py --model large-v3
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
- [x] Protected browser benchmark route, automatic WER/CER, reviewable code-switch/entity scoring, downstream task checks, aggregates and exports
- [x] Reproducible Sahara, Groq Whisper Large V3 and Groq Whisper Large V3 Turbo batch runners
- [x] Responsible AI note
- [x] Sahara credits restored / benchmark runner ready
- [ ] Add permitted code-switched benchmark audio + reference transcripts
- [ ] Populate measured results for Sahara + Groq Whisper Large V3 + Groq Whisper Large V3 Turbo
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
