import { createFileRoute } from "@tanstack/react-router";
import { Download, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STORAGE_EVENT, storage } from "@/lib/storage";
import type { SavedDocument } from "@/lib/types";
import { exportDocument } from "@/services/documents/documents";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents — Dami AI" },
      {
        name: "description",
        content:
          "Research notes, legal memos and summaries Dami composed from your questions, ready to download and share.",
      },
      { property: "og:title", content: "Documents — Dami AI" },
      {
        property: "og:description",
        content: "Download the research notes and legal memos Dami composed from your questions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentsPage,
});

const KIND_LABEL: Record<SavedDocument["kind"], string> = {
  "research-note": "Research note",
  "legal-memo": "Legal memo",
  summary: "Summary",
};

function DocumentsPage() {
  const [docs, setDocs] = useState<SavedDocument[]>([]);

  useEffect(() => {
    const load = () => setDocs(storage.listDocuments());
    load();
    window.addEventListener(STORAGE_EVENT, load);
    return () => window.removeEventListener(STORAGE_EVENT, load);
  }, []);

  return (
    <AppShell>
      <h1 className="text-3xl font-semibold tracking-tight">Documents</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Notes and memos Dami wrote from your research.
      </p>

      {docs.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">
          No documents yet. Save a research note or legal memo from any answer.
        </p>
      ) : (
        <div className="mt-8 space-y-4">
          {docs.map((doc) => (
            <Card key={doc.id} className="shadow-[var(--shadow-soft)]">
              <CardHeader className="space-y-2">
                <Badge variant="secondary" className="w-fit">
                  {KIND_LABEL[doc.kind]}
                </Badge>
                <CardTitle className="text-base leading-snug">{doc.title}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Updated {new Date(doc.updatedAt).toLocaleString("en-GB")}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-4 text-xs leading-relaxed">
                  {doc.body}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportDocument(doc, "md")}>
                    <Download className="mr-2 h-4 w-4" /> Markdown
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportDocument(doc, "txt")}>
                    <Download className="mr-2 h-4 w-4" /> Plain text
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      storage.deleteDocument(doc.id);
                      setDocs(storage.listDocuments());
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
