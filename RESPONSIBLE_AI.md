# Responsible AI — Dami AI

Dami is a voice-first legal research assistant built for the Sahara CodeSwitch Africa Challenge. It is not a lawyer, court, emergency service, or substitute for qualified legal representation.

## Privacy and consent

Users should knowingly activate Dami before their legal question is sent for transcription or research. The installed Windows companion uses a narrow local wake-phrase grammar for “Hey Dami”; activation starts the actual Dami voice workflow. API credentials remain server-side and must never be exposed in the browser or committed to the repository.

Benchmark recordings must be consented, appropriately licensed, or otherwise permitted for evaluation. Private client communications, privileged material, confidential case files, and personally identifying recordings must not be added to the public benchmark repository.

## Legal safety

Legal answers are informational research assistance. Law varies by jurisdiction and changes over time. Dami should identify or ask for jurisdiction when it materially affects the answer, distinguish uncertainty from established authority, prioritize primary legal sources, and expose citations so users can verify important claims.

Dami must not fabricate legislation, cases, judges, quotations, sections, dates, holdings, or source URLs. High-stakes matters such as arrest, imminent deadlines, violence, detention, immigration status, or major financial/legal consequences should encourage timely assistance from an appropriate qualified professional or authority.

## Speech-model limitations

African accents, background noise, names, legal terminology, and code-switch boundaries can produce transcription errors. A fluent transcript is not proof that it is correct. Users should be able to inspect the transcript and sources before relying on the output.

Benchmark results must report measured outputs without selectively editing model transcripts. Test conditions and model identity should be recorded so comparisons remain reviewable.

## Inclusion and fairness

Dami is intended for multilingual African users, but supported languages and accents are not evidence of equal performance. Benchmark results should be broken down by language pair and relevant recording conditions where sample size permits. Poorer performance for a language/accent should be documented rather than hidden.

## Data minimization and security

Only information necessary to complete the user's request should be sent to speech, search, and reasoning services. Secrets belong in deployment environment variables. Repository secret scanning is enabled. Public documentation and benchmarks must not contain API keys, credentials, privileged legal data, or private user recordings.

## Human responsibility

Dami supports access to legal information and research; final professional judgment remains with the user and, where appropriate, a qualified legal practitioner. The interface should communicate uncertainty and source limitations instead of presenting generated text as authoritative merely because it sounds confident.
