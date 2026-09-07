/**
 * Dami's legal reasoning agent — SERVER ONLY.
 *
 * Primary path for now: Groq legal reasoning. Tavily live web search can be
 * re-enabled later. Gemini and OpenAI remain optional fallbacks.
 * API keys must stay server-side in environment variables.
 */

import type { Citation, ResearchAnswer } from "@/lib/types";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env["DAMI_GROQ_MODEL"] ?? "llama-3.3-70b-versatile";
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

Be a capable legal research partner. Start with the useful answer, then explain the strongest authority you reliably know, how it applies, important uncertainty, and the next sensible legal research or practice step when relevant.

Never fabricate a case, statute, court, judge, section, quotation, date, source, or URL. Distinguish binding authority from persuasive material. If you are not confident that an authority is accurate or current, say so rather than inventing details. Because live web search is temporarily unavailable, explicitly flag facts that should be checked against a current official source.

If jurisdiction is genuinely unclear and a safe answer requires it, ask one concise jurisdiction question instead of guessing.

Understand African-accented English and code-switching. Answer in the language the user used when you can do so reliably; otherwise use clear English without pretending fluency.

Dami provides legal information and research assistance. Do not front-load a generic disclaimer; mention professional advice only where the user's situation genuinely calls for it.`;

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Web source";
  }
}

async function researchWithGroq(question: string, groqKey: string): Promise<ResearchAnswer> {
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
          content: `${IDENTITY_PROMPT}\n\nLive web search is not connected in this deployment. Do not claim that you searched the internet and do not fabricate citations. Give the best careful legal research assistance you can from your model knowledge, clearly identifying anything that needs current-source verification.`,
        },
        { role: "user", content: question },
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

  return {
    answer,
    keyFindings: [],
    citations: [],
    insufficientEvidence: false,
    limitations:
      "Live web search is temporarily not connected. Current statutes, cases and procedural details should be verified against an official legal source before professional reliance.",
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
  return {
    answer,
    keyFindings: [],
    citations,
    insufficientEvidence: citations.length === 0,
    limitations: "Verify critical legal authorities at their linked primary sources.",
  };
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
    output?: Array<{
      content?: Array<{
        text?: string;
        annotations?: Array<{ type?: string; title?: string; url?: string }>;
      }>;
    }>;
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
    }
  }
  if (!answer.trim()) throw new ResearchError("OpenAI fallback returned no answer.", 502);
  return {
    answer: answer.trim(),
    keyFindings: [],
    citations,
    insufficientEvidence: citations.length === 0,
    limitations: "Verify critical legal authorities at their linked primary sources.",
  };
}

export async function research(question: string): Promise<ResearchAnswer> {
  const trimmed = question.trim();
  if (!trimmed) throw new ResearchError("Ask Dami a question first.", 400);

  const groqKey = process.env["GROQ_API_KEY"];
  if (groqKey) return researchWithGroq(trimmed, groqKey);

  const liveWebEnabled = process.env["DAMI_LIVE_WEB"] !== "false";
  if (liveWebEnabled) {
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
  }

  throw new ResearchError(
    "Dami's reasoning service isn't configured. Add GROQ_API_KEY to enable Dami chat.",
    503,
  );
}
