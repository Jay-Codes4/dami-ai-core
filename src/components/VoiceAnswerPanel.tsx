import { FileDown, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { SourceCard } from "@/components/SourceCard";
import { Button } from "@/components/ui/button";
import type { ResearchAnswer, ResearchSession } from "@/lib/types";
import { composeDocument, exportDocument, saveDocument } from "@/services/documents/documents";

interface VoiceAnswerPanelProps {
  answer: ResearchAnswer;
  session?: ResearchSession | null;
  speaking?: boolean;
  onReplay: () => void;
  onStop: () => void;
}

export function VoiceAnswerPanel({
  answer,
  session,
  speaking = false,
  onReplay,
  onStop,
}: VoiceAnswerPanelProps) {
  function handleSave(kind: "research-note" | "legal-memo") {
    if (!session) return;
    const doc = composeDocument(session, kind);
    saveDocument(doc);
    toast.success(kind === "legal-memo" ? "Legal memo saved." : "Research note saved.");
    void exportDocument(doc, "md");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {speaking ? <Volume2 className="h-5 w-5 animate-pulse" /> : <RotateCcw className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold">{speaking ? "Dami is responding" : "Voice response ready"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {answer.insufficientEvidence
                ? "Dami could not verify enough authority to give a confident legal answer."
                : "Dami's answer is delivered by voice. The authorities below remain available for verification."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-center gap-2">
            {speaking ? (
              <Button variant="secondary" onClick={onStop}>
                <VolumeX className="mr-2 h-4 w-4" /> Stop
              </Button>
            ) : (
              <Button variant="secondary" onClick={onReplay}>
                <Volume2 className="mr-2 h-4 w-4" /> Replay
              </Button>
            )}
          </div>
        </div>

        {session && (
          <div className="mt-5 flex flex-wrap justify-center gap-2 border-t border-border/60 pt-5 sm:justify-start">
            <Button variant="outline" onClick={() => handleSave("research-note")}>
              <FileDown className="mr-2 h-4 w-4" /> Save research note
            </Button>
            <Button variant="outline" onClick={() => handleSave("legal-memo")}>
              <FileDown className="mr-2 h-4 w-4" /> Save legal memo
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Authorities relied on
        </h2>
        {answer.citations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No verified authority was attached to this response.
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
