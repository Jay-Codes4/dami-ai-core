/**
 * Citation builder.
 *
 * Citations are constructed *only* from corpus records. A model may choose
 * which source ids it relied on; it can never supply a title, locator or URL.
 * Unknown ids are dropped rather than rendered.
 */

import { getSourceById } from "@/services/legal/corpus";
import type { Citation, LegalSource, RetrievedPassage } from "@/lib/types";

export function toCitation(source: LegalSource): Citation {
  return {
    sourceId: source.id,
    title: source.title,
    authority: source.authority,
    locator: source.locator,
    date: source.year ? String(source.year) : null,
    url: source.url,
    officialSource: source.officialSource,
    ...(source.passage ? { passage: source.passage } : {}),
  };
}

export function buildCitations(sourceIds: string[]): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const id of sourceIds) {
    if (seen.has(id)) continue;
    const source = getSourceById(id);
    if (!source) continue; // never render an authority Dami cannot verify
    seen.add(id);
    citations.push(toCitation(source));
  }
  return citations;
}

export function citationsFromRetrieval(results: RetrievedPassage[]): Citation[] {
  return results.map((r) => toCitation(r.source));
}

export function formatCitation(citation: Citation): string {
  const parts = [citation.title, citation.locator, citation.date].filter(Boolean);
  return `${parts.join(", ")} — ${citation.officialSource}`;
}
