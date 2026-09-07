import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Citation, LegalSource } from "@/lib/types";

type SourceLike = Pick<LegalSource, "title" | "authority" | "locator" | "url" | "officialSource"> & {
  summary?: string;
  passage?: string;
  year?: number | null;
};

export function SourceCard({ source }: { source: SourceLike | Citation }) {
  const summary = "summary" in source ? source.summary : undefined;
  const year = "year" in source ? source.year : undefined;

  return (
    <Card className="h-full shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{source.locator}</Badge>
          {year ? <Badge variant="outline">{year}</Badge> : null}
        </div>
        <CardTitle className="text-base leading-snug">{source.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{source.authority}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {summary ? <p className="text-muted-foreground">{summary}</p> : null}
        {source.passage ? (
          <blockquote className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground">
            {source.passage}
          </blockquote>
        ) : null}
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          {source.officialSource}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}
