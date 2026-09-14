/**
 * Typed RPC surface between the Dami browser app and the server.
 * Client code imports only this module — never the `.server.ts` helpers.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ResearchAnswer } from "@/lib/types";

const TranscriptContextInput = z.object({
  originalTranscript: z.string().min(1).max(8000),
  normalizedRetrievalQuery: z.string().min(1).max(8000),
  transcriptEngine: z.enum(["sahara-stt", "windows-speech", "browser-speech", "typed"]),
  selectedLanguage: z.enum(["en", "ig", "pcm"]),
  expectedLanguages: z.array(z.string().min(1).max(40)).max(3),
  codeSwitchedMode: z.boolean(),
});
const QuestionInput = z.object({
  question: z.string().min(3).max(8000),
  context: TranscriptContextInput.optional(),
});

export const askDami = createServerFn({ method: "POST" })
  .validator((input: unknown) => QuestionInput.parse(input))
  .handler(async ({ data }): Promise<ResearchAnswer> => {
    const { research, ResearchError } = await import("@/services/agent/research.server");
    try {
      const query = data.context?.normalizedRetrievalQuery ?? data.question;
      const result = await research(query);
      if (!data.context) return result;
      return {
        ...result,
        workflow: {
          originalTranscript: data.context.originalTranscript,
          normalizedRetrievalQuery: query,
          transcriptEngine: data.context.transcriptEngine,
          selectedLanguage: data.context.selectedLanguage,
          expectedLanguages: data.context.expectedLanguages,
          codeSwitchedMode: data.context.codeSwitchedMode,
        },
      };
    } catch (error) {
      if (error instanceof ResearchError) throw new Error(error.message);
      console.error("Research failed", error);
      throw new Error("Dami couldn't complete the research just now. Please try again.");
    }
  });

export interface ServiceStatus {
  sahara: boolean;
  reasoning: boolean;
  liveWeb: boolean;
}

export const getServiceStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<ServiceStatus> => ({
    sahara: Boolean(process.env["INTRON_API_KEY"]),
    reasoning: Boolean(process.env["GROQ_API_KEY"]),
    liveWeb: Boolean(process.env["EXA_API_KEY"] && process.env["DAMI_LIVE_WEB"] !== "false"),
  }),
);
