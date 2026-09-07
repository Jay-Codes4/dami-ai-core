# Dami AI Core

**Dami AI — A Voice for Justice** is a voice-first African legal AI agent for legal research, legal information and practitioner-focused assistance.

The product is designed to understand African-accented speech, support code-switching, identify the relevant legal jurisdiction, research authoritative sources and return a useful answer with verifiable citations instead of generic search-result summaries.

## Current deadline scope

The launch voice set is intentionally small so it can be tested thoroughly before submission:

- English with an African-accented voice
- Akan ↔ English
- Yoruba ↔ English
- Swahili ↔ English
- Nigerian Pidgin ↔ English

Sahara supports more African languages; those should be added after the launch set is benchmarked and stable.

## Development

```sh
npm install
npm run dev
```

The web app uses TanStack Start. Server-only credentials must never use a `VITE_` prefix.

Recommended server environment variables:

```text
INTRON_API_KEY=...
OPENAI_API_KEY=...
DAMI_REASONING_MODEL=gpt-5.6-terra
DAMI_LIVE_WEB=true
```

`OPENAI_API_KEY` powers Dami's direct Responses API reasoning and live web-search path. This is the preferred runtime now that development is no longer dependent on Lovable credits.

`LOVABLE_API_KEY` is optional and retained only as a compatibility fallback for the local verified-corpus path.

Optional endpoint overrides:

```text
SAHARA_STT_SYNC_URL=https://infer.voice.intron.io/file/v1/upload/sync
SAHARA_TTS_GENERATE_URL=https://infer.voice.intron.io/tts/v1/generate
```

## Deploy to Vercel

The repository includes `vercel.json` and switches the Lovable/TanStack Nitro build to the Vercel preset when the `VERCEL` environment variable is present.

1. Import this GitHub repository into Vercel.
2. Add `INTRON_API_KEY` and `OPENAI_API_KEY` under Project Settings → Environment Variables.
3. Optionally add `DAMI_REASONING_MODEL=gpt-5.6-terra` and `DAMI_LIVE_WEB=true`.
4. Do not expose any server secret with a `VITE_` prefix.
5. Deploy. TanStack Start server functions and API routes run as server-side Vercel functions.

## Live legal research

When `OPENAI_API_KEY` is configured, Dami uses the OpenAI Responses API with live web search. The agent is instructed to prioritize primary legal sources such as courts, legislation portals, gazettes, regulators and government agencies. Web citations shown to the user are taken from actual URL citations returned by the research response rather than invented URLs.

The local verified corpus remains available as a fallback and as a controlled benchmark path. It should continue expanding across African jurisdictions.

## Desktop companion

The `desktop/` folder contains the Electron companion shell. It is deliberately permission-scoped: `contextIsolation` is enabled, Node integration is disabled, sandboxing is enabled, and the web UI only receives a narrow bridge for Dami-specific desktop capabilities.

Run the web app first, then in another terminal:

```sh
npm run desktop:dev
```

By default the companion loads `http://localhost:3000/ask?desktop=1`. To point an installed build at the hosted Dami app, set:

```text
DAMI_DESKTOP_URL=https://your-dami-domain.example/ask?desktop=1
```

The desktop companion is always-on-top and can be docked to the top or bottom of the user's active desktop work area from inside Dami.

## Product rules

- Dami is not a Ghana-only assistant.
- Jurisdiction must be treated as part of the legal problem rather than assumed.
- Never fabricate cases, statutes, quotations, judges, sections or URLs.
- Prefer authoritative court, legislation, regulator and government sources.
- Explain why an authority matters; do not return a bland dump of links.
- If evidence is weak or missing, say exactly what is missing.
- Dami provides legal information and research assistance, not a substitute for a qualified lawyer where professional advice is required.
