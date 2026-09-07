/**
 * Typed RPC surface between the Dami browser app and the server.
 * Client code imports only this module — never the `.server.ts` helpers.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ResearchAnswer } from "@/lib/types";

const QuestionInput = z.object({ question: z.string().min(3).max(1200) });

export const askDami = createServerFn({ method: "POST" })
  .validator((input: unknown) => QuestionInput.parse(input))
  .handler(async ({ data }): Promise<ResearchAnswer> => {
    const { research, ResearchError } = await import("@/services/agent/research.server");
    try {
      return await research(data.question);
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
    reasoning: Boolean(process.env["OPENAI_API_KEY"] || process.env["LOVABLE_API_KEY"]),
    liveWeb: Boolean(process.env["OPENAI_API_KEY"] && process.env["DAMI_LIVE_WEB"] !== "false"),
  }),
);
