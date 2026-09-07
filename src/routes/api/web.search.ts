import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { searchOfficialLegalWeb, WebToolError } from "@/services/tools/web.server";

const Body = z.object({
  query: z.string().min(2).max(500),
});

export const Route = createFileRoute("/api/web/search")({
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
          return Response.json({ error: "Enter a valid legal research query." }, { status: 400 });
        }

        try {
          const results = await searchOfficialLegalWeb(parsed.data.query);
          return Response.json({ results });
        } catch (error) {
          if (error instanceof WebToolError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error("Dami web search failed", error);
          return Response.json({ error: "Dami couldn't search the web just now." }, { status: 502 });
        }
      },
    },
  },
});
