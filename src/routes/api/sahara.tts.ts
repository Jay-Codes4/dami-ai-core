import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  SaharaNotConfiguredError,
  SaharaRequestError,
  synthesize,
} from "@/services/sahara/sahara.server";

const Body = z.object({
  text: z.string().min(1).max(6000),
  accent: z.string().default("ghanaian"),
  gender: z.string().default("female"),
  language: z.string().default("en-GH"),
});

export const Route = createFileRoute("/api/sahara/tts")({
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
          return Response.json({ error: "There was nothing for Dami to read aloud." }, { status: 400 });
        }

        try {
          const { audio, mime } = await synthesize(parsed.data);
          return new Response(audio as unknown as BodyInit, {
            headers: { "Content-Type": mime, "Cache-Control": "no-store" },
          });
        } catch (error) {
          if (error instanceof SaharaNotConfiguredError) {
            return Response.json({ error: error.message, code: "not_configured" }, { status: 503 });
          }
          if (error instanceof SaharaRequestError) {
            return Response.json({ error: error.message }, { status: 502 });
          }
          console.error("Sahara TTS failed", error);
          return Response.json(
            { error: "Dami couldn't speak that answer aloud just now." },
            { status: 502 },
          );
        }
      },
    },
  },
});
