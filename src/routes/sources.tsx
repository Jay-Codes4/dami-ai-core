import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { SourceCard } from "@/components/SourceCard";
import { Input } from "@/components/ui/input";
import { LEGAL_CORPUS } from "@/services/legal/corpus";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "Ghanaian legal sources — Dami AI" },
      {
        name: "description",
        content:
          "Browse the verified Ghanaian Constitution articles, Acts of Parliament and official public-service sources Dami researches from.",
      },
      { property: "og:title", content: "Ghanaian legal sources — Dami AI" },
      {
        property: "og:description",
        content: "The verified Ghanaian authorities Dami researches from, each linked to its official home.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LEGAL_CORPUS;
    return LEGAL_CORPUS.filter((source) =>
      [source.title, source.authority, source.locator, source.summary, ...source.topics]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query]);

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tight">Sources</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Dami only answers from these verified Ghanaian authorities. Every entry links to the
        official repository that hosts the full text, so you can always check the wording yourself.
      </p>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by topic, Act number or authority"
        className="mt-6 max-w-md"
        aria-label="Search legal sources"
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((source) => (
          <SourceCard key={source.id} source={source} />
        ))}
      </div>

      {results.length === 0 && (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          Nothing in Dami's sources matches that search.
        </p>
      )}
    </AppShell>
  );
}
