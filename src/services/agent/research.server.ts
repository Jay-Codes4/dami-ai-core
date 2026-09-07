/**
 * Dami's legal reasoning agent — SERVER ONLY.
 *
 * Contract: the model may only reason over passages handed to it by the
 * retrieval layer, and may only reference sources by their corpus id. Titles,
 * locators and URLs are attached afterwards by the citation builder, so a
 * fabricated authority cannot reach the user. When the retrieved evidence is
 * inadequate the model must say so.
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

const SYSTEM_PROMPT = `You are Dami, a voice-first legal research assistant for Ghana. Your motto is "A Voice for Justice".

ABSOLUTE RULES
1. Reason ONLY from the SOURCES block supplied in the user message. It is your entire evidence base.
2. Never invent or assert a case name, party name, judge, statute number, section, quotation, date or URL. If it is not in the SOURCES block, you do not know it.
3. The SOURCES entries are citation-level records (title, authority, locator, topical description). They are NOT the full text of the instrument. Never present their descriptions as quotations, and never claim to have read the full text.
4. Cite by "sourceIds" only, using the exact ids given. Cite only sources you actually relied on.
5. If the sources do not adequately answer the question, set insufficientEvidence to true, explain the gap plainly, and point the user to the official repositories listed. Do not guess.
6. Speak plainly. The answer will be read aloud, so use short sentences, no markdown, no bullet characters, no headings.
7. Understand Ghanaian-accented English and Akan-English code-switching in the question; always answer in clear English unless the user explicitly asks otherwise.
8. Always be clear that this is legal information and research assistance, not a substitute for advice from a qualified lawyer.

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
  if (!trimmed) {
    throw new ResearchError("Ask Dami a question first.", 400);
  }

  const results = retrieve(trimmed);

  if (results.length === 0) {
    return {
      answer:
        "Dami could not find an authority in its verified Ghanaian corpus that speaks to this question, so it will not attempt an answer.",
      keyFindings: [],
      citations: [],
      insufficientEvidence: true,
      limitations:
        "Dami's corpus currently covers core Ghanaian constitutional provisions, principal statutes and official public-service portals. Nothing in it matched this question closely enough to ground an answer. Try rephrasing, or consult the Judicial Service of Ghana, GhaLII or the Legal Aid Commission directly.",
    };
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new ResearchError(
      "Dami's reasoning service isn't configured on this server yet.",
      503,
    );
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
                  ? "The retrieval scores are weak. Be especially cautious and prefer to report insufficient evidence."
                  : "These are the highest-ranked verified sources for this question."
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
      throw new ResearchError(
        "Dami's research allowance has run out. The workspace owner needs to top up AI credits.",
        402,
      );
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
      "Dami provides legal information and research assistance. Verify every authority at its official source before relying on it.",
  };
}
