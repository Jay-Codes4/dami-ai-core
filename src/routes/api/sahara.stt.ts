import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  SaharaNotConfiguredError,
  SaharaRequestError,
  transcribe,
} from "@/services/sahara/sahara.server";

const Body = z.object({
  audioBase64: z.string().min(1),
  sampleRate: z.number().int().min(8000).max(48000),
  language: z.string().default("en-GH"),
  codeSwitching: z.boolean().default(true),
});

export const Route = createFileRoute("/api/sahara/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }

        const parsed = Body.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "That recording couldn't be read. Please try again." },
            { status: 400 },
          );
        }

        try {
          const result = await transcribe(parsed.data);
          if (!result.text) {
            return Response.json(
              { error: "Dami didn't catch any speech in that recording." },
              { status: 422 },
            );
          }
          return Response.json(result);
        } catch (error) {
          if (error instanceof SaharaNotConfiguredError) {
            return Response.json({ error: error.message, code: "not_configured" }, { status: 503 });
          }
          if (error instanceof SaharaRequestError) {
            return Response.json({ error: error.message }, { status: 502 });
          }
          console.error("Sahara STT failed", error);
          return Response.json(
            { error: "Dami couldn't reach the speech service just now." },
            { status: 502 },
          );
        }
      },
    },
  },
});
