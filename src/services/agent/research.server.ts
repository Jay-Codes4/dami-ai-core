/**
 * Dami's legal reasoning agent — SERVER ONLY.
 *
 * Dami prefers live, source-backed web research. Gemini is the primary path
 * when GEMINI_API_KEY is configured, with OpenAI retained as an optional
 * fallback. The verified local corpus remains a safe fallback and benchmark
 * path.
 */

import { buildCitations } from "@/services/citations/citations";
import { isInsufficient, retrieve } from "@/services/rag/retrieve";
import type { Citation, ResearchAnswer, RetrievedPassage } from "@/lib/types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env["DAMI_REASONING_MODEL"] ?? "gpt-5.6-terra";
const GEMINI_MODEL = process.env["DAMI_GEMINI_MODEL"] ?? "gemini-3-flash-preview";
const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const LOVABLE_MODEL = "openai/gpt-6-astra";

export class ResearchError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}

const IDENTITY_PROMPT = `You are Dami, an African legal AI agent. Your motto is "A Voice for Justice".

You assist lawyers, legal researchers, students, public-service teams and people seeking legal information. You are not a Ghana-only product. Treat jurisdiction as part of every legal problem and never silently assume a country when the answer depends on it.

Be a capable legal research partner, not a search-results page. Understand what the user is trying to accomplish and answer that task directly. Start with the useful answer. Then explain the strongest authority, how it applies, important uncertainty and the next sensible legal research or practice step when relevant.

Never fabricate a case, statute, court, judge, section, quotation, date or URL. Distinguish binding authority from persuasive material. Prefer primary and authoritative sources: legislation portals, constitutions, courts, gazettes, regulators, government agencies and reputable legal-information institutes. Use secondary commentary only to orient the research, never as a substitute for primary authority when primary authority is available.

Do not give a bland list of links. Explain why each relied-on source matters. Do not hide uncertainty behind generic phrases such as "it depends"; say exactly what fact, jurisdiction, procedure or authority the conclusion depends on.

Understand African-accented English and code-switching. Answer in the language the user used when you can do so reliably; otherwise use clear English without pretending fluency.

Dami provides legal information and research assistance. Do not front-load a generic disclaimer; mention professional advice only where the user's situation genuinely calls for it.`;

const LOCAL_SYSTEM_PROMPT = `${IDENTITY_PROMPT}

For this request, reason ONLY from the SOURCES block supplied in the user message. It is your verified evidence base. Source descriptions are not quotations. Cite by sourceIds only, using exact ids supplied. If evidence is inadequate, set insufficientEvidence=true and explain exactly what is missing.

The answer field may be read aloud, so use natural paragraphs and short sentences with no markdown headings or bullet symbols.

Return JSON only, matching the schema exactly.`;

const LOCAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "keyFindings", "sourceIds", "insufficientEvidence", "limitations"],
  properties: {
    answer: { type: "string" },
    keyFindings: { type: "array", items: { type: "string" } },
    sourceIds: { type: "array", items: { type: "string" } },
    insufficientEvidence: { type: "boolean" },
    limitations: { type: "string" },
  },
} as const;

function renderSources(results: RetrievedPassage[]): string {
  return results
    .map((r, index) => {
      const s = r.source;
      return [
        `[${index + 1}] id: ${s.id}`,
        `title: ${s.title}`,
        `authority: ${s.authority}`,
        `jurisdiction: ${s.jurisdiction}`,
        `type: ${s.docType}`,
        `locator: ${s.locator}`,
        `year: ${s.year ?? "unknown"}`,
        `official repository: ${s.officialSource} (${s.url})`,
        `topical description (NOT a quotation): ${s.summary}`,
        s.passage ? `verbatim passage: "${s.passage}"` : "verbatim passage: none available",
      ].join("\n");
    })
    .join("\n\n");
}

interface LocalModelOutput {
  answer: string;
  keyFindings: string[];
  sourceIds: string[];
  insufficientEvidence: boolean;
  limitations: string;
}

function extractJson(payload: unknown): LocalModelOutput {
  const body = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };
  let text = body.output_text ?? "";
  if (!text && Array.isArray(body.output)) {
    for (const item of body.output) for (const part of item.content ?? []) if (part.text) text += part.text;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new ResearchError("Dami couldn't put that research together. Please try again.", 502);
  return JSON.parse(text.slice(start, end + 1)) as LocalModelOutput;
}

interface UrlAnnotation {
  type?: string;
  title?: string;
  url?: string;
}

function extractWebResponse(payload: unknown): { text: string; citations: Citation[] } {
  const body = payload as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string; annotations?: UrlAnnotation[] }>;
    }>;
  };

  let text = body.output_text ?? "";
  const annotations: UrlAnnotation[] = [];
  if (Array.isArray(body.output)) {
    for (const item of body.output) {
      for (const part of item.content ?? []) {
        if (!body.output_text && typeof part.text === "string") text += part.text;
        for (const annotation of part.annotations ?? []) {
          if (annotation.type === "url_citation" && annotation.url) annotations.push(annotation);
        }
      }
    }
  }

  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const annotation of annotations) {
    if (!annotation.url || seen.has(annotation.url)) continue;
    seen.add(annotation.url);
    let host = "Web source";
    try {
      host = new URL(annotation.url).hostname.replace(/^www\./, "");
    } catch {
      /* keep generic host label */
    }
    citations.push({
      sourceId: `web_${citations.length + 1}`,
      title: annotation.title || host,
      authority: host,
      locator: "Live web authority",
      date: null,
      url: annotation.url,
      officialSource: host,
    });
  }

  return { text: text.trim(), citations };
}

interface GeminiGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

function extractGeminiResponse(payload: unknown): { text: string; citations: Citation[] } {
  const body = payload as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: GeminiGroundingChunk[] };
    }>;
  };

  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);

    let host = "Web source";
    try {
      host = new URL(uri).hostname.replace(/^www\./, "");
    } catch {
      /* keep generic host label */
    }

    citations.push({
      sourceId: `web_${citations.length + 1}`,
      title: chunk.web?.title || host,
      authority: host,
      locator: "Google Search grounded authority",
      date: null,
      url: uri,
      officialSource: host,
    });
  }

  return { text, citations };
}

async function researchFromGemini(question: string, apiKey: string): Promise<ResearchAnswer> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: `${IDENTITY_PROMPT}\n\nUse Google Search grounding for this request. Search broadly enough to identify the jurisdiction and strongest relevant authorities, but prioritize primary legal sources. Every material legal proposition should be grounded in sources. If the jurisdiction is genuinely unclear and a safe answer requires it, ask one concise jurisdiction question instead of guessing.`,
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: question }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Gemini web research error", response.status, detail);
    if (response.status === 429) {
      throw new ResearchError("Dami's free research quota is temporarily busy. Try again shortly.", 429);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ResearchError("Dami's Gemini research key isn't authorized correctly yet.", 503);
    }
    throw new ResearchError("Dami couldn't complete live legal research just now.", 502);
  }

  const { text, citations } = extractGeminiResponse(await response.json());
  if (!text) throw new ResearchError("Dami couldn't put that live research together. Please try again.", 502);

  return {
    answer: text,
    keyFindings: [],
    citations,
    insufficientEvidence: citations.length === 0,
    limitations:
      citations.length === 0
        ? "The live research response did not expose verifiable source citations, so Dami will not treat it as fully grounded."
        : "Live legal research can change as courts, legislation and official portals update. Verify critical authorities at the linked primary source before filing, advising or relying on them.",
  };
}

async function researchFromWeb(question: string, apiKey: string): Promise<ResearchAnswer> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: "medium" },
      instructions: `${IDENTITY_PROMPT}\n\nUse live web search for this request. Search broadly enough to identify the jurisdiction and strongest relevant authorities, but prioritize primary legal sources. Every material legal proposition in your answer should be supported by a web-cited source. If the jurisdiction is genuinely unclear and a safe answer requires it, ask one concise jurisdiction question instead of guessing.`,
      tools: [{ type: "web_search", search_context_size: "high" }],
      include: ["web_search_call.action.sources"],
      input: question,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("OpenAI web research error", response.status, detail);
    if (response.status === 429) throw new ResearchError("Dami is handling a lot of research right now. Try again shortly.", 429);
    throw new ResearchError("Dami couldn't complete live legal research just now.", 502);
  }

  const { text, citations } = extractWebResponse(await response.json());
  if (!text) throw new ResearchError("Dami couldn't put that live research together. Please try again.", 502);

  return {
    answer: text,
    keyFindings: [],
    citations,
    insufficientEvidence: citations.length === 0,
    limitations:
      citations.length === 0
        ? "The live research response did not expose verifiable source citations, so Dami will not treat it as fully grounded."
        : "Live legal research can change as courts, legislation and official portals update. Verify critical authorities at the linked primary source before filing, advising or relying on them.",
  };
}

async function researchFromLocalCorpus(question: string): Promise<ResearchAnswer> {
  const results = retrieve(question);
  if (results.length === 0) {
    return {
      answer:
        "I don't have a verified authority in the current local corpus that is strong enough to answer this safely. Tell me the jurisdiction if you haven't already, or enable Dami's live web research so I can look for current primary authorities.",
      keyFindings: [],
      citations: [],
      insufficientEvidence: true,
      limitations: "The built-in verified corpus is still being expanded across African jurisdictions.",
    };
  }

  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) {
    throw new ResearchError(
      "Dami's reasoning service isn't configured. Add GEMINI_API_KEY for free live research, OPENAI_API_KEY for OpenAI live research, or LOVABLE_API_KEY for the legacy local-corpus path.",
      503,
    );
  }

  const response = await fetch(LOVABLE_GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
    body: JSON.stringify({
      model: LOVABLE_MODEL,
      reasoning: { effort: "medium" },
      instructions: LOCAL_SYSTEM_PROMPT,
      text: {
        format: { type: "json_schema", name: "dami_research_answer", strict: true, schema: LOCAL_SCHEMA },
      },
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `QUESTION:\n${question}\n\nRETRIEVAL NOTE: ${
                isInsufficient(results)
                  ? "The retrieval scores are weak. Report the precise evidence gap if the sources do not support a useful conclusion."
                  : "These are the highest-ranked verified sources currently available for this question."
              }\n\nSOURCES:\n${renderSources(results)}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Legacy reasoning gateway error", response.status, detail);
    throw new ResearchError("Dami couldn't complete the research just now.", 502);
  }

  const output = extractJson(await response.json());
  const citations = buildCitations(output.sourceIds ?? []);
  return {
    answer: output.answer,
    keyFindings: Array.isArray(output.keyFindings) ? output.keyFindings : [],
    citations,
    insufficientEvidence: Boolean(output.insufficientEvidence) || citations.length === 0,
    limitations:
      output.limitations ||
      "Dami provides legal information and research assistance. Verify important authorities at their official source before relying on them in practice.",
  };
}

export async function research(question: string): Promise<ResearchAnswer> {
  const trimmed = question.trim();
  if (!trimmed) throw new ResearchError("Ask Dami a question first.", 400);

  const liveWebEnabled = process.env["DAMI_LIVE_WEB"] !== "false";
  const geminiKey = process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"];
  if (geminiKey && liveWebEnabled) return researchFromGemini(trimmed, geminiKey);

  const openAiKey = process.env["OPENAI_API_KEY"];
  if (openAiKey && liveWebEnabled) return researchFromWeb(trimmed, openAiKey);

  return researchFromLocalCorpus(trimmed);
}
