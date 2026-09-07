import type { ToolName } from "@/services/tools/interfaces";

export type AgentIntent =
  | "legal-research"
  | "open-source"
  | "save-document"
  | "read-file"
  | "copy-text"
  | "notify"
  | "general";

export interface AgentPlan {
  intent: AgentIntent;
  tools: ToolName[];
  requiresConfirmation: boolean;
  reason: string;
}

const FILE_READ = /\b(read|open|review|summari[sz]e|analyse|analyze)\b.*\b(file|document|pdf|docx|txt|markdown)\b/i;
const SAVE_DOCUMENT = /\b(save|export|write|download)\b.*\b(file|document|memo|note|summary|report)\b/i;
const OPEN_SOURCE = /\b(open|visit|show)\b.*\b(source|link|website|page|authority)\b/i;
const COPY_TEXT = /\b(copy|clipboard)\b/i;
const NOTIFY = /\b(notify|notification|alert me)\b/i;
const LEGAL = /\b(law|legal|constitution|article|act|statute|case|court|judge|detention|arrest|bail|rights?|police|contract|land|employment|crime|criminal|civil|ghana|authority|authorities)\b/i;

/**
 * Internal capability routing only. The product UI should communicate the task
 * state (thinking, preparing, ready) rather than narrating implementation
 * details such as network access, search providers, APIs or tool calls.
 */
export function planAgentRequest(input: string): AgentPlan {
  const text = input.trim();

  if (FILE_READ.test(text)) {
    return {
      intent: "read-file",
      tools: ["file_read"],
      requiresConfirmation: true,
      reason: "The user asked Dami to inspect a local document.",
    };
  }

  if (SAVE_DOCUMENT.test(text)) {
    return {
      intent: "save-document",
      tools: ["file_save"],
      requiresConfirmation: true,
      reason: "The request creates or changes a file on the user's device.",
    };
  }

  if (OPEN_SOURCE.test(text)) {
    return {
      intent: "open-source",
      tools: ["web_open"],
      requiresConfirmation: false,
      reason: "The user explicitly asked to open a source.",
    };
  }

  if (COPY_TEXT.test(text)) {
    return {
      intent: "copy-text",
      tools: ["clipboard"],
      requiresConfirmation: false,
      reason: "The user explicitly asked to copy text.",
    };
  }

  if (NOTIFY.test(text)) {
    return {
      intent: "notify",
      tools: ["notifications"],
      requiresConfirmation: true,
      reason: "Desktop notifications require an explicit user-facing action.",
    };
  }

  if (LEGAL.test(text)) {
    return {
      intent: "legal-research",
      tools: ["web_search", "web_read"],
      requiresConfirmation: false,
      reason: "Legal research may use approved external authorities when the verified corpus needs enrichment.",
    };
  }

  return {
    intent: "general",
    tools: [],
    requiresConfirmation: false,
    reason: "No external capability is necessary for this request.",
  };
}
