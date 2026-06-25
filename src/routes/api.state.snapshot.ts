import { createFileRoute } from "@tanstack/react-router";
import { saveBookSnapshot } from "@/lib/store/sqlite-db";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export const Route = createFileRoute("/api/state/snapshot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          if (!body || !body.books) {
            return new Response(JSON.stringify({ error: "Missing books in request body" }), { status: 400, headers });
          }
          
          const ts = body.ts || Date.now();
          for (const book of Object.values(body.books) as any[]) {
            await saveBookSnapshot(book.marketId, book, ts);
          }
          
          return new Response(JSON.stringify({ ok: true }), { headers });
        } catch (error) {
          console.error("POST /api/state/snapshot error:", error);
          return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers });
        }
      },
    },
  },
});
