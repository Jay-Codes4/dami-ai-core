import { FileDown, Volume2, VolumeX } from "lucide-react";

import { SourceCard } from "@/components/SourceCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResearchAnswer, ResearchSession } from "@/lib/types";
import { composeDocument, exportDocument, saveDocument } from "@/services/documents/documents";
import { toast } from "sonner";

interface AnswerPanelProps {
  question: string;
  answer: ResearchAnswer;
  session?: ResearchSession | null;
  speaking?: boolean;
  onReadAloud?: () => void;
  onStopSpeaking?: () => void;
}

export function AnswerPanel({
  question,
  answer,
  session,
  speaking,
  onReadAloud,
  onStopSpeaking,
}: AnswerPanelProps) {
  function handleSave(kind: "research-note" | "legal-memo") {
    if (!session) return;
    const doc = composeDocument(session, kind);
    saveDocument(doc);
    toast.success(kind === "legal-memo" ? "Legal memo saved." : "Research note saved.");
    exportDocument(doc, "md");
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-[var(--shadow-soft)]">
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your question
          </p>
          <CardTitle className="text-lg leading-snug">{question}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {answer.insufficientEvidence ? (
            <Alert>
              <AlertTitle>Dami doesn't have enough authority for this</AlertTitle>
              <AlertDescription>
                {answer.limitations ||
                  "Nothing in Dami's verified Ghanaian sources answers this question. Please speak to a qualified lawyer."}
              </AlertDescription>
            </Alert>
          ) : (
            <p className="whitespace-pre-wrap text-[0.975rem] leading-relaxed">{answer.answer}</p>
          )}

          {answer.keyFindings.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Key findings</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {answer.keyFindings.map((finding) => (
                  <li key={finding}>{finding}</li>
                ))}
              </ul>
            </div>
          )}

          {!answer.insufficientEvidence && answer.limitations ? (
            <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
              {answer.limitations}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {speaking ? (
              <Button variant="secondary" onClick={onStopSpeaking}>
                <VolumeX className="mr-2 h-4 w-4" /> Stop
              </Button>
            ) : (
              onReadAloud && (
                <Button variant="secondary" onClick={onReadAloud}>
                  <Volume2 className="mr-2 h-4 w-4" /> Read aloud
                </Button>
              )
            )}
            {session && (
              <>
                <Button variant="outline" onClick={() => handleSave("research-note")}>
                  <FileDown className="mr-2 h-4 w-4" /> Save research note
                </Button>
                <Button variant="outline" onClick={() => handleSave("legal-memo")}>
                  <FileDown className="mr-2 h-4 w-4" /> Save legal memo
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Authorities relied on
        </h2>
        {answer.citations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No authority was cited, so nothing here should be treated as settled law.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {answer.citations.map((citation) => (
              <SourceCard key={citation.sourceId} source={citation} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
