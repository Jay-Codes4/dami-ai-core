import type { WebSearchResult } from "@/services/tools/interfaces";

export async function searchOfficialSources(query: string): Promise<WebSearchResult[]> {
  const response = await fetch("/api/web/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    results?: WebSearchResult[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Dami couldn't search official sources just now.");
  }

  return Array.isArray(payload.results) ? payload.results : [];
}
