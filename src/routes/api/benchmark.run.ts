import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  authorizeBenchmark,
  benchmarkStatus,
  runBenchmark,
} from "@/services/benchmark/benchmark.server";

const handlers = {
  GET: () => Response.json(benchmarkStatus(), { headers: { "Cache-Control": "no-store" } }),
  POST: async ({ request }: { request: Request }) => {
    const authorization = authorizeBenchmark(request);
    if (!authorization.ok)
      return Response.json({ error: authorization.error }, { status: authorization.status });
    try {
      const form = await request.formData();
      return Response.json(await runBenchmark(form), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof z.ZodError)
        return Response.json(
          { error: "Complete the test ID, language category and exact reference transcript." },
          { status: 400 },
        );
      console.error("Benchmark run failed", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "The benchmark run failed." },
        { status: 400 },
      );
    }
  },
};

export const Route = createFileRoute("/api/benchmark/run")({
  server: { handlers },
});
