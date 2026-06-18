import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/polymarket/fees")({
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
          const entries = await Promise.all(tokenIds.map(fetchFee));
          return new Response(JSON.stringify({ fees: Object.fromEntries(entries), fetchedAt: Date.now() }), { headers: cors });
        } catch (error) {
          return new Response(JSON.stringify({ error: (error as Error).message }), { status: 502, headers: cors });
        }
      },
    },
  },
});

async function fetchFee(tokenId: string): Promise<[string, number | null]> {
  const response = await fetch(`https://clob.polymarket.com/fee-rate?token_id=${encodeURIComponent(tokenId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return [tokenId, null];
  const data = (await response.json()) as { base_fee?: number };
  return [tokenId, typeof data.base_fee === "number" ? data.base_fee : null];
}
