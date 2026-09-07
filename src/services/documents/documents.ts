/**
 * Document service — research notes, legal memos and summaries.
 *
 * Everything here is real: documents are composed from research Dami actually
 * produced, stored through the storage adapter, and exported as genuine files.
 * No processing is simulated.
 */

import { formatCitation } from "@/services/citations/citations";
import { newId, storage } from "@/lib/storage";
import type { ResearchSession, SavedDocument, SavedDocumentKind } from "@/lib/types";

const DISCLAIMER =
  "Dami AI provides legal information and research assistance. It is not a substitute for advice from a qualified lawyer. Verify every authority at its official source.";

export function composeDocument(
  session: ResearchSession,
  kind: SavedDocumentKind,
): SavedDocument {
  const { question, answer } = session;
  const date = new Date(session.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const heading =
    kind === "legal-memo" ? "Legal memorandum" : kind === "summary" ? "Summary" : "Research note";

  const lines: string[] = [
    `# ${heading}: ${question}`,
    "",
    `Prepared by Dami AI — ${date}`,
    "",
    "## Question",
    question,
    "",
    "## Dami's answer",
    answer.answer,
  ];

  if (kind !== "summary" && answer.keyFindings.length > 0) {
    lines.push("", "## Key findings", ...answer.keyFindings.map((f) => `- ${f}`));
  }

  if (answer.citations.length > 0) {
    lines.push(
      "",
      "## Authorities relied on",
      ...answer.citations.map((c) => `- ${formatCitation(c)} — ${c.url}`),
    );
  } else {
    lines.push("", "## Authorities relied on", "- None. Dami reported insufficient evidence.");
  }

  if (answer.limitations) {
    lines.push("", "## Limitations", answer.limitations);
  }

  lines.push("", "---", DISCLAIMER);

  const now = new Date().toISOString();
  return {
    id: newId("doc"),
    kind,
    title: `${heading} — ${question.slice(0, 70)}${question.length > 70 ? "…" : ""}`,
    body: lines.join("\n"),
    sessionId: session.id,
    createdAt: now,
    updatedAt: now,
  };
}

export function saveDocument(doc: SavedDocument): void {
  storage.saveDocument(doc);
}

export function exportDocument(doc: SavedDocument, format: "md" | "txt" = "md"): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([doc.body], {
    type: format === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(doc.title)}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "dami-document"
  );
}

export { DISCLAIMER };
