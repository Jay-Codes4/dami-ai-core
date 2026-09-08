/**
 * Dami's legal reasoning agent — SERVER ONLY.
 *
 * Primary path: Exa live web search -> Groq legal reasoning.
 * Groq-only remains a safe fallback if Exa is unavailable.
 * API keys must stay server-side in environment variables.
 */

import type { Citation, ResearchAnswer } from "@/lib/types";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env["DAMI_GROQ_MODEL"] ?? "llama-3.3-70b-versatile";
const EXA_SEARCH_URL = "https://api.exa.ai/search";

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

You assist lawyers, legal researchers, students, public-service teams and people seeking legal information across African jurisdictions. Treat jurisdiction as part of every legal problem and never silently assume a country when the answer depends on it.

Be a capable legal research partner, not a search-results page. Start with the useful answer, then explain the strongest authority, how it applies, important uncertainty, and the next sensible legal research or practice step when relevant.

Never fabricate a case, statute, court, judge, section, quotation, date, source, or URL. Distinguish binding authority from persuasive material. Prefer primary and authoritative sources such as legislation portals, constitutions, courts, gazettes, regulators, government agencies, and reputable legal-information institutes. Use secondary commentary only to orient the research.

If the supplied sources do not establish a legal proposition, say so. If jurisdiction is genuinely unclear and a safe answer requires it, ask one concise jurisdiction question instead of guessing.

Understand African-accented English and code-switching. Answer in the language the user used when you can do so reliably; otherwise use clear English without pretending fluency.

Dami provides legal information and research assistance. Do not front-load a generic disclaimer; mention professional advice only where the user's situation genuinely calls for it.`;

interface ExaResult {
  title?: string;
  url?: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
  score?: number;
}

interface ExaPayload {
  results?: ExaResult[];
  requestId?: string;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web source";
  }
}

async function searchWithExa(question: string, apiKey: string): Promise<ExaResult[]> {
  const response = await fetch(EXA_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query: `${question}\nFind the strongest current legal authorities. Prioritize constitutions, statutes, regulations, court decisions, gazettes, regulators, government portals, and reputable legal-information institutes.`,
      type: "auto",
      numResults: 8,
      contents: {
        highlights: true,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Exa search error", response.status, detail);
    if (response.status === 401 || response.status === 403) {
      throw new ResearchError("Dami's Exa research key isn't authorized correctly yet.", 503);
    }
    if (response.status === 429) {
      throw new ResearchError("Dami's live-search quota is temporarily busy. Try again shortly.", 429);
    }
    throw new ResearchError("Dami couldn't search the live web just now.", 502);
  }

  const payload = (await response.json()) as ExaPayload;
  return (payload.results ?? []).filter((result) => Boolean(result.url));
}

function exaCitations(results: ExaResult[]): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const result of results) {
    const url = result.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const host = hostFromUrl(url);
    citations.push({
      sourceId: `web_${citations.length + 1}`,
      title: result.title || host,
      authority: host,
      locator: "Live web authority via Exa",
      date: result.publishedDate ?? null,
      url,
      officialSource: host,
    });
  }

  return citations;
}

function renderExaEvidence(results: ExaResult[]): string {
  return results
    .map((result, index) => {
      const url = result.url ?? "";
      const highlights = (result.highlights ?? []).join("\n").trim();
      const evidence = highlights || result.text?.slice(0, 5000) || "No extracted passage available.";
      return [
        `[S${index + 1}] ${result.title || hostFromUrl(url)}`,
        `URL: ${url}`,
        `Source: ${hostFromUrl(url)}`,
        result.publishedDate ? `Published: ${result.publishedDate}` : null,
        `Evidence: ${evidence}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

async function callGroq(question: string, groqKey: string, evidence?: string): Promise<string> {
  const grounded = Boolean(evidence);
  const response = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.15,
      messages: [
        {
          role: "system",
          content: grounded
            ? `${IDENTITY_PROMPT}\n\nFor this request, reason from the supplied LIVE SOURCES. Cite relied-on evidence inline using [S1], [S2], etc. Do not invent sources or URLs. Explain which authority is strongest and why. If the evidence is insufficient, say exactly what is missing.`
            : `${IDENTITY_PROMPT}\n\nLive web evidence is unavailable for this request. Do not claim you searched the internet and do not fabricate citations. Give the best careful legal assistance you can from model knowledge, clearly flagging anything that needs current-source verification.`,
        },
        {
          role: "user",
          content: grounded ? `QUESTION:\n${question}\n\nLIVE SOURCES:\n${evidence}` : question,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Groq reasoning error", response.status, detail);
    if (response.status === 401 || response.status === 403) {
      throw new ResearchError("Dami's Groq reasoning key isn't authorized correctly yet.", 503);
    }
    if (response.status === 429) {
      throw new ResearchError("Dami's free reasoning quota is temporarily busy. Try again shortly.", 429);
    }
    throw new ResearchError("Dami couldn't complete the legal reasoning just now.", 502);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!answer) throw new ResearchError("Dami couldn't put that answer together. Please try again.", 502);
  return answer;
}

async function researchWithExaAndGroq(
  question: string,
  exaKey: string,
  groqKey: string,
): Promise<ResearchAnswer> {
  const results = await searchWithExa(question, exaKey);
  if (results.length === 0) {
    throw new ResearchError(
      "Dami couldn't find strong enough live sources for that question. Try adding the jurisdiction.",
      404,
    );
  }

  const citations = exaCitations(results);
  const evidence = renderExaEvidence(results);
  const answer = await callGroq(question, groqKey, evidence);

  return {
    answer,
    keyFindings: [],
    citations,
    insufficientEvidence: citations.length === 0,
    limitations:
      "Live legal research can change as courts, legislation and official portals update. Verify critical authorities at the linked primary source before filing, advising or relying on them.",
  };
}

async function researchWithGroqOnly(question: string, groqKey: string): Promise<ResearchAnswer> {
  const answer = await callGroq(question, groqKey);
  return {
    answer,
    keyFindings: [],
    citations: [],
    insufficientEvidence: false,
    limitations:
      "Live web search was unavailable for this request. Current statutes, cases and procedural details should be verified against an official legal source before professional reliance.",
  };
}

export async function research(question: string): Promise<ResearchAnswer> {
  const trimmed = question.trim();
  if (!trimmed) throw new ResearchError("Ask Dami a question first.", 400);

  const groqKey = process.env["GROQ_API_KEY"];
  if (!groqKey) {
    throw new ResearchError("Dami's reasoning service isn't configured. Add GROQ_API_KEY to enable Dami chat.", 503);
  }

  const liveWebEnabled = process.env["DAMI_LIVE_WEB"] !== "false";
  const exaKey = process.env["EXA_API_KEY"];

  if (liveWebEnabled && exaKey) {
    try {
      return await researchWithExaAndGroq(trimmed, exaKey, groqKey);
    } catch (error) {
      console.error("Exa + Groq live research path failed", error);
      if (error instanceof ResearchError && (error.status === 401 || error.status === 403)) throw error;
    }
  }

  return researchWithGroqOnly(trimmed, groqKey);
}
