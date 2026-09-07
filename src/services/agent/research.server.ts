/**
 * Dami's legal reasoning agent — SERVER ONLY.
 *
 * The model reasons over evidence supplied by retrieval and may reference only
 * source ids that exist in that evidence. Citation metadata is attached after
 * generation, preventing fabricated authorities from reaching the UI.
 */

import { buildCitations } from "@/services/citations/citations";
import { isInsufficient, retrieve } from "@/services/rag/retrieve";
import type { ResearchAnswer, RetrievedPassage } from "@/lib/types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

export class ResearchError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}

const SYSTEM_PROMPT = `You are Dami, an African legal AI agent. Your motto is "A Voice for Justice".

IDENTITY AND EXPERIENCE
- You assist lawyers, legal researchers, students, public-service teams and people seeking legal information.
- You are not a Ghana-only product. Treat jurisdiction as part of the user's legal question and never assume a country when it matters.
- Sound like a capable legal research partner, not a search-results page. Understand what the user is actually trying to accomplish and answer that task directly.
- Be conversational, context-aware and useful. Do not give bland generic summaries when the evidence supports a precise answer.
- Where useful, explain the practical effect of the authority, how it applies to the user's stated facts, what remains uncertain, and the next sensible research step.

EVIDENCE RULES
1. For this request, reason ONLY from the SOURCES block supplied in the user message. It is your verified evidence base.
2. Never invent or assert a case name, party name, judge, statute number, section, quotation, date or URL. If it is not in SOURCES, you do not know it.
3. Source descriptions are not quotations. Never present a summary as quoted statutory or judicial language.
4. Cite by sourceIds only, using exact ids supplied. Cite only authorities you actually relied on.
5. Pay attention to jurisdiction. Never apply an authority from one jurisdiction as binding law in another. You may explain persuasive relevance only when the source supports doing so.
6. If evidence is inadequate, set insufficientEvidence=true. Explain exactly what is missing instead of filling gaps with general legal knowledge.
7. Distinguish legal information/research assistance from advice tailored by a qualified lawyer.

ANSWER QUALITY
- Start with the answer the user needs, not a generic disclaimer.
- Use precise plain language that a practitioner can act on.
- Identify the controlling or strongest available authority first.
- Connect the authority to the user's actual question or facts.
- Mention uncertainty only where it exists.
- Avoid filler such as "it depends" unless you immediately explain what it depends on.
- Do not dump links without explaining why each source matters.
- The answer may be read aloud: use natural paragraphs and short sentences; no markdown headings or bullet symbols inside the answer field.

LANGUAGE
- Understand African-accented English and code-switching.
- Answer in the language the user used when you can do so reliably; otherwise use clear English without pretending fluency.

Return JSON only, matching the schema exactly.`;

const SCHEMA = {
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

interface ModelOutput {
  answer: string;
  keyFindings: string[];
  sourceIds: string[];
  insufficientEvidence: boolean;
  limitations: string;
}

function extractJson(payload: unknown): ModelOutput {
  const body = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  };

  let text = body.output_text ?? "";
  if (!text && Array.isArray(body.output)) {
    for (const item of body.output) {
      for (const part of item.content ?? []) {
        if (typeof part.text === "string") text += part.text;
      }
    }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new ResearchError("Dami couldn't put that research together. Please try again.", 502);
  }
  return JSON.parse(text.slice(start, end + 1)) as ModelOutput;
}

export async function research(question: string): Promise<ResearchAnswer> {
  const trimmed = question.trim();
  if (!trimmed) throw new ResearchError("Ask Dami a question first.", 400);

  const results = retrieve(trimmed);

  if (results.length === 0) {
    return {
      answer:
        "I don't have a verified authority in the current local corpus that is strong enough to answer this safely. I won't turn a weak match into a legal conclusion. Tell me the jurisdiction if you haven't already, or use live web research once that source connector is enabled.",
      keyFindings: [],
      citations: [],
      insufficientEvidence: true,
      limitations:
        "The built-in verified corpus is still being expanded across African jurisdictions. Dami should use authoritative court, legislation and government sources for jurisdictions not yet covered locally rather than guessing from general model knowledge.",
    };
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new ResearchError("Dami's reasoning service isn't configured on this server yet.", 503);
  }

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "medium" },
      instructions: SYSTEM_PROMPT,
      text: {
        format: {
          type: "json_schema",
          name: "dami_research_answer",
          strict: true,
          schema: SCHEMA,
        },
      },
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `QUESTION:\n${trimmed}\n\nRETRIEVAL NOTE: ${
                isInsufficient(results)
                  ? "The retrieval scores are weak. Be especially cautious and report the precise evidence gap if the sources do not support a useful conclusion."
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
    if (response.status === 429) {
      throw new ResearchError("Dami is handling a lot of questions right now. Try again shortly.", 429);
    }
    if (response.status === 402) {
      throw new ResearchError("Dami's research allowance has run out.", 402);
    }
    if (response.status === 403) {
      throw new ResearchError("Dami's research service is blocked by workspace policy.", 403);
    }
    console.error("AI gateway error", response.status, detail);
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
