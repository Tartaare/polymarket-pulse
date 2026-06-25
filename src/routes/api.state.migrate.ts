import { createFileRoute } from "@tanstack/react-router";
import { readAppState, writeAppState } from "@/lib/store/sqlite-db";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/state/migrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          if (!body || !body.state) {
            return new Response(JSON.stringify({ error: "Missing state in request body" }), { status: 400, headers });
          }

          // Check if SQLite already has an active state to avoid overwriting existing server state
          const existingState = await readAppState();
          if (existingState) {
            return new Response(
              JSON.stringify({ ok: true, migrated: false, message: "Server database already initialized" }),
              { headers }
            );
          }

          await writeAppState(body.state);
          console.log("Successfully migrated IndexedDB state to SQLite server-side");
          return new Response(JSON.stringify({ ok: true, migrated: true }), { headers });
        } catch (error) {
          console.error("POST /api/state/migrate error:", error);
          return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers });
        }
      },
    },
  },
});
