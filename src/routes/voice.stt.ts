import { createFileRoute } from "@tanstack/react-router";
import { handleSaharaStt } from "@/services/sahara/http.server";

export const Route = createFileRoute("/voice/stt")({
  server: {
    handlers: {
      POST: ({ request }) => handleSaharaStt(request),
    },
  },
});
