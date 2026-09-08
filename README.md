# Dami AI — A Voice for Justice

> A voice-first African legal AI agent built for the Sahara CodeSwitch Africa Challenge.

Dami helps people ask legal questions the way they naturally speak — including African accents and code-switched speech — then turns that voice request into grounded legal research with verifiable sources.

The goal is simple: **make serious legal research easier to access by voice without pretending uncertainty does not exist.**

## Why Dami

Across Africa, legal information is often difficult to search, difficult to understand, and even harder to use when the person asking the question is more comfortable speaking than typing. Standard speech systems also struggle when speakers switch naturally between English and local languages.

Dami combines African speech technology with a legal research agent so a spoken question can become an actual downstream legal task rather than stopping at transcription.

## What the experience looks like

1. The user speaks naturally to Dami.
2. Sahara converts the recording to text, including supported code-switched speech.
3. Dami identifies the legal task and relevant jurisdiction instead of silently assuming one.
4. Live research retrieves current legal sources.
5. A reasoning model produces a concise, source-grounded answer.
6. Dami speaks the answer back using an African voice.

On desktop, Dami is designed to live as a lightweight floating companion. The user can say **“Hey Dami”**, hear a response such as **“How can I help you today?”**, and continue the interaction without opening the browser first.

## Challenge fit

Dami targets the **Legal & Public Services** track of the Sahara CodeSwitch Africa Challenge.

The challenge asks teams to build a real voice application where speech drives a downstream task, demonstrate code-switching, benchmark Sahara against other speech models, document the implementation, and address responsible AI. Dami is built around that exact workflow: voice is the entry point to legal research, not the final output of the system.

Challenge: https://www.intron.io/sahara-v2-5/sahara-codeswitch-africa/

## Launch language set

The deadline build intentionally keeps the launch set small enough to test properly:

- English
- Akan ↔ English
- Yoruba ↔ English
- Swahili ↔ English
- Nigerian Pidgin ↔ English

Sahara STT supports a wider African language surface. Dami can expand after the launch set is benchmarked and stable.

For TTS, Dami only requests accent/language combinations that Sahara currently exposes. English and Akan-input sessions currently fall back to a supported female Yoruba-accented English voice because the current Sahara TTS catalogue does not expose a Ghanaian/Twi English output voice.

## Architecture

```text
User voice
   ↓
Browser / Electron microphone capture
   ↓
Sahara STT
   ↓
Dami legal research agent
   ├─ Exa live legal-source search
   └─ Groq legal reasoning
   ↓
Source-grounded answer + citations
   ↓
Sahara TTS
   ↓
Spoken Dami response
```

### Web

- **TanStack Start + React + TypeScript**
- Vercel deployment
- Server-only API credentials
- Voice session state machine for listening → transcribing → researching → speaking
- Live legal research with citations

### Speech

- **Sahara STT** for African-accented and code-switched speech
- **Sahara TTS** for spoken responses
- Secure server-side TTS proxy so the Intron credential never enters the browser bundle
- Automatic end-of-turn detection after roughly 2 seconds of sustained silence

### Legal research

- **Exa** retrieves current web evidence
- **Groq** performs legal reasoning over the retrieved evidence
- Dami prioritizes constitutions, legislation, courts, gazettes, regulators, government portals, and reputable legal-information institutes
- Jurisdiction is treated as part of the legal problem
- Dami is instructed never to fabricate cases, statutes, quotations, judges, sections, dates, or URLs

### Desktop companion

- Electron shell in `desktop/`
- Floating, transparent, always-on-top Dami companion
- “Hey Dami” wake interaction when speech recognition is available
- Click-to-talk fallback
- Optional launch at startup
- Windows installer built with Electron Builder / NSIS
- Desktop and Start Menu shortcuts

## Responsible AI

Dami is designed around four rules:

**Privacy.** API keys stay server-side. The browser never receives Sahara, Groq, or Exa credentials. Desktop wake-word listening is separated from the legal transcription flow so the full speech request is only submitted after activation.

**Legal safety.** Dami provides legal information and research assistance. It does not present uncertain material as binding law and should surface jurisdiction or evidence limitations when they matter.

**Source integrity.** Dami prefers primary legal authorities and exposes source links so important propositions can be checked before professional reliance.

**No fabricated benchmark claims.** Benchmark scores will only be published from actual test audio and measured outputs.

## Benchmark plan

The final benchmark is structured to compare **Sahara + at least three other speech models** on the same legal-domain, code-switched audio.

Planned evaluation dimensions:

- Word Error Rate (WER)
- Character Error Rate (CER)
- Code-switched word accuracy
- Legal-term accuracy
- End-to-end transcription latency
- Language pair
- Accent / country
- Recording device
- Noise condition

The benchmark results will be added only after the test set is run. This repository intentionally contains no invented scores.

## Run locally

Requirements: Node.js 22+ and npm.

```bash
git clone https://github.com/Jay-Codes4/dami-ai-core.git
cd dami-ai-core
npm install
npm run dev
```

Create a local `.env` from `.env.example` and add your own credentials. **Never commit the populated file.**

```text
INTRON_API_KEY=your_server_key
GROQ_API_KEY=your_server_key
EXA_API_KEY=your_server_key
DAMI_LIVE_WEB=true
DAMI_GROQ_MODEL=openai/gpt-oss-120b
```

Optional endpoint overrides:

```text
SAHARA_STT_SYNC_URL=https://infer.voice.intron.io/file/v1/upload/sync
SAHARA_TTS_GENERATE_URL=https://infer.voice.intron.io/tts/v1/generate
```

Server secrets must never use a `VITE_` prefix.

## Windows desktop build

Run the web app first, then launch the Electron companion:

```bash
npm run desktop:dev
```

Build the Windows installer:

```bash
npm run desktop:build:win
```

The installer is emitted as:

```text
release/Dami-Setup.exe
```

GitHub Actions also builds and publishes the Windows installer automatically from `main`.

## Deployment

The web app is configured for Vercel through `vercel.json`.

Required production environment variables:

```text
INTRON_API_KEY
GROQ_API_KEY
EXA_API_KEY
DAMI_LIVE_WEB=true
```

Optional:

```text
DAMI_GROQ_MODEL=openai/gpt-oss-120b
DAMI_DESKTOP_URL=https://your-dami-domain.example
```

## Repository map

```text
api/                         secure server-side TTS WebSocket proxy
desktop/                     Electron desktop companion
src/hooks/useVoiceSession.ts voice interaction state machine
src/services/sahara/         Sahara STT/TTS integration
src/services/agent/          legal research + reasoning
src/routes/                  web app routes and desktop companion UI
.github/workflows/           Windows installer + security automation
```

## Security

No production secrets belong in this repository. `.env` files, private keys, credentials files, and generated installers are ignored by Git. Use `.env.example` only as a list of required variable names.

Before public release, the repository is scanned for accidental credentials and the history is checked for common secret-file paths. If a secret is ever committed, rotating the credential is required even after history cleanup.

## Current status

Dami is an active competition build. Core web research, Sahara speech integration, desktop companion infrastructure, settings, Windows packaging, and citation-aware legal answers are implemented. Voice reliability and benchmark execution are being hardened for final submission.

---

**Dami AI**  
*A Voice for Justice.*
