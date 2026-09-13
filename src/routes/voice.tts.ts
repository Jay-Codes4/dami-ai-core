import { createFileRoute } from "@tanstack/react-router";
import { handleSaharaTts } from "@/services/sahara/http.server";

export const Route = createFileRoute("/voice/tts")({
  server: {
    handlers: {
      POST: ({ request }) => handleSaharaTts(request),
    },
  },
});
