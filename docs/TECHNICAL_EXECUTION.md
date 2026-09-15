# Dami AI — Technical Execution

## Sahara CodeSwitch Africa Submission

**Category:** Legal & Public Services  
**Product:** Dami AI  
**Repository:** https://github.com/Jay-Codes4/dami-ai-core  
**Live application:** https://dami-ai-core.vercel.app/  
**Voice experience:** https://dami-ai-core.vercel.app/ask  
**Benchmark:** https://dami-ai-core.vercel.app/benchmark

## 1. Solution overview

Dami AI is a voice-first legal research assistant designed around the multilingual reality of African users. A user can speak a legal question naturally, including code-switched speech, and Dami turns that interaction into a structured legal research workflow.

The product combines speech understanding, language and jurisdiction context, legal-intent interpretation, live research, source traceability, conversational responses, and a desktop companion.

Sahara CodeSwitch is the core competition speech integration and the centre of Dami's African code-switching implementation.

## 2. Problem

Most legal research products assume typed, formal queries and largely monolingual interaction. In practice, African users frequently communicate across English, local languages, and Pidgin within the same conversation.

Dami explores a different interaction model: allow the user to speak naturally, preserve what was said, understand the legal question in context, retrieve relevant authorities, and return an understandable, sourced response.

## 3. Technical execution

The high-level Dami pipeline is:

**Voice input → Sahara CodeSwitch → transcript → language/context → jurisdiction-aware legal intent → live legal research → source verification → grounded legal response → Dami voice experience → web/desktop**

### Voice and code-switching

The web experience provides a voice-first interface with selectable language modes. Sahara CodeSwitch is integrated as the competition speech layer for African speech and code-switching.

Dami is designed to preserve the original voice transcript so that users can see what the speech system understood before relying on the generated legal response.

### Language and jurisdiction context

Dami does not treat language merely as display preference. Language can provide useful retrieval context.

For the Nigerian Pidgin and Igbo demonstration modes, Dami constrains legal retrieval toward Nigeria and prioritises Nigerian law and Nigerian official or primary legal authorities. This helps prevent a code-switched Nigerian question from drifting into unrelated jurisdictions.

The broader architecture remains extensible to other African language/jurisdiction combinations.

### Legal research

After transcription, Dami interprets the user's question as a legal research task. The research layer searches for relevant material, prioritises authoritative sources where available, and uses the retrieved evidence to construct a grounded response.

The user can inspect the resulting sources rather than receiving an unsupported legal-sounding answer.

### Source traceability

Source visibility is a core product requirement. Dami exposes supporting authorities and research material so that users can verify important claims and continue into the underlying source.

### Saved research and documents

Dami includes Saved Research and Documents experiences so the product can develop beyond one-off question answering into a persistent legal research workspace.

### Desktop companion

Dami Desktop extends the voice-first interaction model beyond the browser. The companion is designed to make Dami available while a user works, with wake interaction, speech capture, research, and conversational response connected to the same Dami research experience.

### Interactive Dami character

The Dami avatar gives the voice assistant a consistent visual identity across the product. Its interaction states are designed around listening, thinking, speaking, and idle behaviour rather than presenting voice as only a microphone attached to a chatbot.

## 4. Sahara CodeSwitch implementation

Sahara is the primary competition integration for Dami's African speech and code-switching work.

The implementation is designed around three principles:

1. **Natural speech first:** users should not need to rewrite conversational speech into formal search queries.
2. **Code-switch awareness:** mixed-language speech should remain meaningful as one utterance rather than being treated as unrelated fragments.
3. **Downstream context:** the transcript feeds language, jurisdiction, and legal-intent processing so speech recognition connects directly to useful legal research.

The live demo focuses on Nigerian Pidgin and Igbo code-switching as concrete test cases while the product vision remains Africa-wide.

## 5. Benchmark methodology

The competition benchmark is deliberately separated from the product narrative so Sahara's performance can be evaluated transparently.

In accordance with the challenge requirement, the benchmark compares **at least three speech-recognition models**: Sahara and two comparison ASR models. The comparison-model names and measured results belong in the benchmark report and benchmark interface because they are part of the required evaluation methodology.

Benchmark evaluation should focus on reproducible code-switching performance and the metrics actually produced by the test suite. No benchmark score should be claimed unless it was measured.

See the live benchmark at:
https://dami-ai-core.vercel.app/benchmark

## 6. Product architecture

Dami is implemented as a web application with a companion desktop experience.

Major logical components include:

- user-facing voice capture;
- Sahara CodeSwitch speech integration;
- transcript preservation;
- language and jurisdiction context;
- legal-intent processing;
- live research and retrieval;
- source/authority presentation;
- grounded response generation;
- Dami conversational voice experience;
- saved research and document workflows;
- desktop companion integration; and
- benchmark/evaluation tooling.

The system is intentionally modular so speech evaluation, legal retrieval, user experience, and desktop interaction can be improved independently without rebuilding the complete product.

## 7. Reliability and graceful degradation

Voice AI depends on network services and external infrastructure. Dami is therefore designed so that temporary service limitations do not unnecessarily destroy the rest of a user's research session.

Operational resilience is kept separate from the competition benchmark: benchmark evidence must accurately identify the model that produced each measured transcript.

User-facing error states should remain understandable and should not expose internal credentials, infrastructure details, stack traces, or implementation secrets.

## 8. Security

Secrets and service credentials are expected to remain server-side and outside the public repository. Environment files and private credentials should not be committed.

Client requests should be validated at trust boundaries, and internal service errors should be converted into safe user-facing states rather than exposing raw backend responses.

## 9. Ethics, safety and inclusion

Dami is a **legal information and research assistant**, not a replacement for a qualified lawyer.

The product should:

- encourage verification of important legal authorities;
- preserve source traceability;
- avoid presenting uncertain material as guaranteed legal advice;
- distinguish jurisdictions rather than treating Africa as one legal system;
- support multilingual interaction without assuming language proficiency implies legal knowledge;
- avoid hiding benchmark limitations; and
- keep accessibility and understandable language central to the interface.

Code-switching support is itself an inclusion goal: users should not have to abandon natural multilingual speech simply to interact with a professional AI tool.

## 10. Real-world impact

Dami targets a practical accessibility gap between powerful legal information systems and the way people naturally communicate.

A voice-first, jurisdiction-aware legal research workflow can reduce the friction of converting a real-world legal question into formal search terminology. The approach can be particularly useful for lawyers, legal researchers, public-service contexts, and users who are more comfortable speaking than constructing conventional database queries.

## 11. Competition demonstration

The demo is designed to show one connected workflow:

**Dami introduction → Sahara/code-switching explanation → live legal research → source traceability → real Nigerian Pidgin and Igbo code-switch test → Dami Desktop interaction → benchmark → responsible legal-AI framing.**

The real interaction recording is intended to demonstrate the product rather than replace benchmark evidence.

## 12. Judging-criteria alignment

**Code-Switching Benchmark Quality (30%)**  
Dedicated benchmark, Sahara plus required comparison models, reproducible evaluation, and explicit code-switching focus.

**Product Quality & Fit (25%)**  
Voice-first legal workflow, web experience, desktop companion, source traceability, saved research, and document workspace.

**Real-World Impact (20%)**  
Addresses multilingual access and legal-research friction in African contexts.

**Technical Execution (15%)**  
Integrated speech-to-research pipeline, jurisdiction-aware retrieval, modular architecture, web/desktop delivery, and benchmark tooling.

**Ethics / Safety / Inclusion (10%)**  
Source verification, legal disclaimer, jurisdiction awareness, multilingual inclusion, and transparent benchmark methodology.

## 13. Submission links

- GitHub repository: https://github.com/Jay-Codes4/dami-ai-core
- Live Dami AI: https://dami-ai-core.vercel.app/
- Ask Dami: https://dami-ai-core.vercel.app/ask
- Benchmark: https://dami-ai-core.vercel.app/benchmark

---

**Dami AI — A voice for justice.**
