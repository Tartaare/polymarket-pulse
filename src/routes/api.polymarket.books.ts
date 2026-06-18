import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/polymarket/books")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const tokenIds = (url.searchParams.get("tokenIds") ?? "")
            .split(",")
            .map((tokenId) => tokenId.trim())
            .filter(Boolean)
            .slice(0, 100);
          if (tokenIds.length === 0) {
            return new Response(JSON.stringify({ books: [] }), { headers: cors });
          }
          const books = await Promise.all(tokenIds.map(fetchBook));
          return new Response(JSON.stringify({ books: books.filter(Boolean), fetchedAt: Date.now() }), { headers: cors });
        } catch (error) {
          return new Response(JSON.stringify({ error: (error as Error).message }), { status: 502, headers: cors });
        }
      },
    },
  },
});

async function fetchBook(tokenId: string): Promise<unknown | null> {
  const url = `https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
