import { createFileRoute } from "@tanstack/react-router";
import { readAppState, writeAppState, saveBookSnapshot } from "@/lib/store/sqlite-db";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/state")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const state = await readAppState();
          return new Response(JSON.stringify({ state: state || null }), { headers });
        } catch (error) {
          console.error("GET /api/state error:", error);
          return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          if (!body || !body.state) {
            return new Response(JSON.stringify({ error: "Missing state in request body" }), { status: 400, headers });
          }
          await writeAppState(body.state);
          return new Response(JSON.stringify({ ok: true }), { headers });
        } catch (error) {
          console.error("POST /api/state error:", error);
          return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers });
        }
      },
    },
  },
});
