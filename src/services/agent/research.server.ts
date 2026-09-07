/**
 * Dami's legal reasoning agent — SERVER ONLY.
 *
 * Primary path: Tavily live web search -> Groq legal reasoning.
 * Gemini and OpenAI remain optional fallbacks so Dami is not tied to one
 * provider. API keys must stay server-side in environment variables.
 */

import type { Citation, ResearchAnswer } from "@/lib/types";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env["DAMI_GROQ_MODEL"] ?? "llama-3.3-70b-versatile";
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const GEMINI_MODEL = process.env["DAMI_GEMINI_MODEL"] ?? "gemini-3-flash-preview";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env["DAMI_REASONING_MODEL"] ?? "gpt-5.6-terra";

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

Never fabricate a case, statute, court, judge, section, quotation, date, or URL. Distinguish binding authority from persuasive material. Prefer primary and authoritative sources such as legislation portals, constitutions, courts, gazettes, regulators, government agencies, and reputable legal-information institutes. Use secondary commentary only to orient the research.

If the supplied sources do not establish a legal proposition, say so. If jurisdiction is genuinely unclear and a safe answer requires it, ask one concise jurisdiction question instead of guessing.

Understand African-accented English and code-switching. Answer in the language the user used when you can do so reliably; otherwise use clear English without pretending fluency.

Dami provides legal information and research assistance. Do not front-load a generic disclaimer; mention professional advice only where the user's situation genuinely calls for it.`;

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
}

interface TavilyPayload {
  results?: TavilyResult[];
  response_time?: number | string;
  request_id?: string;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web source";
  }
}

async function searchWithTavily(question: string, apiKey: string): Promise<TavilyResult[]> {
  const response = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `${question}\nFind the strongest current legal authorities, prioritising statutes, constitutions, courts, gazettes, regulators and official government sources.`,
      topic: "general",
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Tavily search error", response.status, detail);
    if (response.status === 401 || response.status === 403) {
      throw new ResearchError("Dami's Tavily research key isn't authorized correctly yet.", 503);
    }
    if (response.status === 429 || response.status === 432) {
      throw new ResearchError("Dami's web-search quota is temporarily unavailable. Try again shortly.", 429);
    }
    throw new ResearchError("Dami couldn't search the live web just now.", 502);
  }

  const payload = (await response.json()) as TavilyPayload;
  return (payload.results ?? []).filter((result) => result.url && result.content);
}

function tavilyCitations(results: TavilyResult[]): Citation[] {
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
      locator: "Live web authority via Tavily",
      date: result.published_date ?? null,
      url,
      officialSource: host,
    });
  }

  return citations;
}

function renderTavilyEvidence(results: TavilyResult[]): string {
  return results
    .map((result, index) => {
      const url = result.url ?? "";
      return [
        `[S${index + 1}] ${result.title || hostFromUrl(url)}`,
        `URL: ${url}`,
        `Source: ${hostFromUrl(url)}`,
        `Evidence: ${result.content ?? ""}`,
      ].join("\n");
    })
    .join("\n\n");
}

async function researchWithGroqAndTavily(
  question: string,
  groqKey: string,
  tavilyKey: string,
): Promise<ResearchAnswer> {
  const results = await searchWithTavily(question, tavilyKey);
  if (results.length === 0) {
    throw new ResearchError("Dami couldn't find strong enough live sources for that question. Try adding the jurisdiction.", 404);
  }

  const citations = tavilyCitations(results);
  const evidence = renderTavilyEvidence(results);

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
          content: `${IDENTITY_PROMPT}\n\nFor this request, reason only from the supplied LIVE SOURCES. Cite relied-on evidence inline using [S1], [S2], etc. Do not invent a source or URL. Explain which authority is strongest and why. If the evidence is insufficient, say exactly what is missing.`,
        },
        {
          role: "user",
          content: `QUESTION:\n${question}\n\nLIVE SOURCES:\n${evidence}`,
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
  if (!answer) throw new ResearchError("Dami couldn't put that research together. Please try again.", 502);

  return {
    answer,
    keyFindings: [],
    citations,
    insufficientEvidence: citations.length === 0,
    limitations:
      "Live legal research can change as courts, legislation and official portals update. Verify critical authorities at the linked primary source before filing, advising or relying on them.",
  };
}

interface GeminiGroundingChunk {
  web?: { uri?: string; title?: string };
}

async function researchFromGemini(question: string, apiKey: string): Promise<ResearchAnswer> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `${IDENTITY_PROMPT}\n\nUse Google Search grounding and prioritise primary legal authorities.` }],
        },
        contents: [{ role: "user", parts: [{ text: question }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { temperature: 0.2 },
      }),
    },
  );

  if (!response.ok) throw new ResearchError("Gemini fallback is unavailable.", response.status === 429 ? 429 : 502);

  const body = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: GeminiGroundingChunk[] };
    }>;
  };
  const candidate = body.candidates?.[0];
  const answer = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("").trim();
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const url = chunk.web?.uri;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const host = hostFromUrl(url);
    citations.push({
      sourceId: `web_${citations.length + 1}`,
      title: chunk.web?.title || host,
      authority: host,
      locator: "Google Search grounded authority",
      date: null,
      url,
      officialSource: host,
    });
  }
  if (!answer) throw new ResearchError("Gemini fallback returned no answer.", 502);
  return { answer, keyFindings: [], citations, insufficientEvidence: citations.length === 0, limitations: "Verify critical legal authorities at their linked primary sources." };
}

async function researchFromOpenAI(question: string, apiKey: string): Promise<ResearchAnswer> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: "medium" },
      instructions: `${IDENTITY_PROMPT}\n\nUse live web search and prioritise primary legal authorities.`,
      tools: [{ type: "web_search", search_context_size: "high" }],
      include: ["web_search_call.action.sources"],
      input: question,
    }),
  });
  if (!response.ok) throw new ResearchError("OpenAI fallback is unavailable.", response.status === 429 ? 429 : 502);

  const body = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; annotations?: Array<{ type?: string; title?: string; url?: string }> }> }>;
  };
  let answer = body.output_text ?? "";
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      if (!body.output_text && part.text) answer += part.text;
      for (const annotation of part.annotations ?? []) {
        if (annotation.type !== "url_citation" || !annotation.url || seen.has(annotation.url)) continue;
        seen.add(annotation.url);
        const host = hostFromUrl(annotation.url);
        citations.push({ sourceId: `web_${citations.length + 1}`, title: annotation.title || host, authority: host, locator: "Live web authority", date: null, url: annotation.url, officialSource: host });
      }
    }
  }
  if (!answer.trim()) throw new ResearchError("OpenAI fallback returned no answer.", 502);
  return { answer: answer.trim(), keyFindings: [], citations, insufficientEvidence: citations.length === 0, limitations: "Verify critical legal authorities at their linked primary sources." };
}

export async function research(question: string): Promise<ResearchAnswer> {
  const trimmed = question.trim();
  if (!trimmed) throw new ResearchError("Ask Dami a question first.", 400);

  const liveWebEnabled = process.env["DAMI_LIVE_WEB"] !== "false";
  if (!liveWebEnabled) {
    throw new ResearchError("Dami's live research is disabled in this deployment.", 503);
  }

  const groqKey = process.env["GROQ_API_KEY"];
  const tavilyKey = process.env["TAVILY_API_KEY"];
  if (groqKey && tavilyKey) {
    try {
      return await researchWithGroqAndTavily(trimmed, groqKey, tavilyKey);
    } catch (error) {
      console.error("Primary Groq + Tavily path failed", error);
    }
  }

  const geminiKey = process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"];
  if (geminiKey) {
    try {
      return await researchFromGemini(trimmed, geminiKey);
    } catch (error) {
      console.error("Gemini fallback failed", error);
    }
  }

  const openAiKey = process.env["OPENAI_API_KEY"];
  if (openAiKey) return researchFromOpenAI(trimmed, openAiKey);

  if (groqKey && !tavilyKey) {
    throw new ResearchError("Dami has Groq configured, but TAVILY_API_KEY is missing for live legal search.", 503);
  }
  if (tavilyKey && !groqKey) {
    throw new ResearchError("Dami has Tavily configured, but GROQ_API_KEY is missing for legal reasoning.", 503);
  }

  throw new ResearchError(
    "Dami's reasoning service isn't configured. Add GROQ_API_KEY and TAVILY_API_KEY to enable the primary live legal research path.",
    503,
  );
}
