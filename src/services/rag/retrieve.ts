/**
 * Retrieval for Dami's legal RAG pipeline.
 *
 * Current implementation: deterministic lexical scoring over the verified seed
 * corpus (works offline, fully explainable, no fabricated results).
 * Planned replacement: pgvector similarity + authority ranking. The exported
 * signature is the contract — the answer layer must not care which is used.
 */

import { LEGAL_CORPUS } from "@/services/legal/corpus";
import type { LegalSource, RetrievedPassage } from "@/lib/types";

const STOP_WORDS = new Set([
  "the","a","an","of","in","on","for","to","is","are","was","were","and","or","my","i","me","what",
  "which","who","how","can","do","does","did","if","it","that","this","with","about","dami","please",
  "tell","law","legal","ghana","ghanaian","question","should","would","there","their","from","be",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/** Very small stemmer: collapses common English plural/verb endings. */
function stem(token: string): string {
  return token
    .replace(/(ies)$/, "y")
    .replace(/(sses|ses)$/, "s")
    .replace(/(ing|ed|s)$/, "");
}

function scoreSource(source: LegalSource, queryTokens: string[]) {
  const haystacks: Array<{ text: string; weight: number }> = [
    { text: source.topics.join(" "), weight: 3 },
    { text: source.title, weight: 2.2 },
    { text: source.locator, weight: 2 },
    { text: source.summary, weight: 1 },
    { text: source.authority, weight: 0.6 },
  ];

  let score = 0;
  const matched = new Set<string>();

  for (const token of queryTokens) {
    const stemmed = stem(token);
    for (const { text, weight } of haystacks) {
      const lower = text.toLowerCase();
      if (lower.includes(token) || (stemmed.length > 3 && lower.includes(stemmed))) {
        score += weight;
        matched.add(token);
      }
    }
  }

  // Light authority preference: constitutional and statutory text outrank portals.
  const authorityBoost =
    source.docType === "constitution" ? 1.15 : source.docType === "legislation" ? 1.08 : 1;

  return { score: score * authorityBoost, matched: [...matched] };
}

export interface RetrieveOptions {
  limit?: number;
  /** Minimum score before a source is considered relevant at all. */
  threshold?: number;
}

export function retrieve(question: string, options: RetrieveOptions = {}): RetrievedPassage[] {
  const { limit = 6, threshold = 2.5 } = options;
  const tokens = tokenize(question);
  if (tokens.length === 0) return [];

  return LEGAL_CORPUS.map((source) => {
    const { score, matched } = scoreSource(source, tokens);
    return { source, score: Number(score.toFixed(2)), matchedTerms: matched };
  })
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** True when retrieval found nothing strong enough to ground an answer. */
export function isInsufficient(results: RetrievedPassage[]): boolean {
  return results.length === 0 || (results[0]?.score ?? 0) < 4;
}
