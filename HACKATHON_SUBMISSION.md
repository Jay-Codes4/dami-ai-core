# Dami AI — Hackathon Submission Pack

## One-line pitch
Dami AI is a voice-first African legal research companion that turns naturally spoken and code-switched legal questions into jurisdiction-aware research, source-grounded reasoning, citations, and spoken answers.

## Problem
Legal information is difficult to search and understand when users naturally speak rather than type, use African accents, or code-switch between English and African languages. Speech errors become especially costly around names, legal terms, statutes and procedural language.

## Solution
Dami makes speech the start of an agentic legal workflow rather than the final output:

Voice → speech recognition → jurisdiction-aware legal research → source retrieval → legal reasoning → citations → spoken answer

The web prototype uses Sahara for the challenge speech path. The Windows companion adds hands-free "Hey Dami" activation and can keep working while its avatar is hidden behind active programs. When Sahara TTS is unavailable, desktop Dami prefers an installed local YarnGPT Nigerian female voice, with Windows speech as a final fallback.

## Demo video script (2–3 minutes)
0:00–0:20 — Problem: explain that African users speak naturally and code-switch while legal search often expects clean typed English.

0:20–0:35 — Product: introduce Dami and explain that voice triggers research, reasoning, citations and a spoken answer.

0:35–1:25 — Live workflow: speak one concise legal question. Show listening/transcription, research, answer and citations. Use Sahara for the challenge path; do not disguise a fallback as Sahara.

1:25–1:50 — Desktop companion: show Dami on the Windows desktop. Open another application so the avatar disappears. Say "Hey Dami" and show that the background assistant can still respond without blocking the app.

1:50–2:15 — Benchmark: show measured Sahara and comparison-model WER/CER results on identical audio. Mention language pair, accent/country and recording conditions.

2:15–2:35 — Responsible AI: explain that Dami is legal research assistance, not a lawyer; it exposes sources, communicates uncertainty and minimizes data.

2:35–2:50 — Close: "Dami AI — a voice for justice."

## Submission fields
Track: Legal & Public Services

Prototype: https://dami-ai-core.vercel.app

Repository: https://github.com/Jay-Codes4/dami-ai-core

Technical summary: React + TypeScript + TanStack Start; Electron desktop companion; Sahara STT/TTS integration and streaming gateway; Exa source retrieval; Groq reasoning; local desktop wake phrase; optional YarnGPT local Nigerian female TTS fallback.

Responsible AI: see RESPONSIBLE_AI.md.

Benchmark: see benchmark/. Sahara credits are restored and the batch runner is ready. Results remain empty until real model outputs are measured on permitted audio.

## Final human-input checklist
- [x] Restore/obtain Sahara credits.
- [x] Add a repeatable Sahara v2.5 batch benchmark runner.
- [ ] Verify a real Sahara voice run with the restored credits.
- [ ] Record or select consented/permitted code-switched benchmark audio.
- [ ] Run Sahara and at least three comparison ASR models on identical audio and populate benchmark/results.csv.
- [ ] Record the 2–3 minute demo video.
- [ ] Add the demo video URL to this file and README.
- [ ] Submit the final challenge form before the deadline.

Do not replace missing measurements with estimates or invented results.
