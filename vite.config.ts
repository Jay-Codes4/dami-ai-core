// @lovable.dev/vite-tanstack-config already includes TanStack Start, React,
// Tailwind, path aliases and Nitro. Do not add duplicate framework plugins.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isVercel = Boolean(process.env.VERCEL);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts.
    server: { entry: "server" },
  },
  // Lovable keeps its own sandbox target. Vercel builds explicitly switch
  // Nitro to the Vercel preset so SSR routes and server functions deploy as
  // Vercel Functions instead of Cloudflare output.
  nitro: isVercel ? { preset: "vercel" } : true,
});
