import type { WebSearchResult } from "@/services/tools/interfaces";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const MAX_READ_BYTES = 250_000;

const OFFICIAL_LEGAL_HOSTS = new Set([
  "ghalii.org",
  "www.ghalii.org",
  "judicial.gov.gh",
  "www.judicial.gov.gh",
  "lawsghana.com",
  "www.lawsghana.com",
  "legalaid.gov.gh",
  "www.legalaid.gov.gh",
  "parliament.gh",
  "www.parliament.gh",
]);

export class WebToolError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = "WebToolError";
  }
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

export function isApprovedLegalHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && OFFICIAL_LEGAL_HOSTS.has(normalizeHost(parsed.hostname));
  } catch {
    return false;
  }
}

export async function webSearch(query: string, count = 8): Promise<WebSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) throw new WebToolError("Give Dami a research query first.", 400);

  const key = process.env["BRAVE_SEARCH_API_KEY"];
  if (!key) {
    throw new WebToolError("Dami's extended research sources are not configured yet.", 503);
  }

  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("count", String(Math.max(1, Math.min(10, count))));
  url.searchParams.set("safesearch", "moderate");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
    },
  });

  if (!response.ok) {
    throw new WebToolError("Dami couldn't complete source discovery just now.");
  }

  const payload = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  return (payload.web?.results ?? [])
    .filter((item) => typeof item.url === "string" && item.url.startsWith("https://"))
    .map((item) => ({
      title: item.title?.trim() || "Untitled result",
      url: item.url!,
      snippet: item.description?.trim() || "",
    }));
}

export async function searchOfficialLegalWeb(query: string): Promise<WebSearchResult[]> {
  const results = await webSearch(`${query} Ghana law court constitution legal`, 10);
  return results.filter((result) => isApprovedLegalHost(result.url));
}

export async function webRead(url: string): Promise<string> {
  if (!isApprovedLegalHost(url)) {
    throw new WebToolError(
      "Dami can only use approved Ghanaian legal and public-service sources in this research mode.",
      403,
    );
  }

  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "DamiAI/1.0 legal-research-assistant" },
  });

  if (!response.ok) throw new WebToolError("Dami couldn't read that authority just now.");

  const finalUrl = response.url || url;
  if (!isApprovedLegalHost(finalUrl)) {
    throw new WebToolError("That authority points outside Dami's approved legal sources.", 403);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new WebToolError("That authority is not available as readable text yet.", 415);
  }

  const text = await response.text();
  if (text.length > MAX_READ_BYTES) return text.slice(0, MAX_READ_BYTES);
  return text;
}

export const APPROVED_LEGAL_HOSTS = [...OFFICIAL_LEGAL_HOSTS];
