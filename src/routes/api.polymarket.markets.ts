import { createFileRoute } from "@tanstack/react-router";
import { normalizeGammaMarket, type GammaMarket } from "@/lib/polymarket/normalize";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/polymarket/markets")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async () => {
        try {
          const markets = await fetchGammaMarkets();
          const normalized = markets
            .map((market) => normalizeGammaMarket(market))
            .filter((market) => market != null)
            .sort((a, b) => a.endDate - b.endDate);
          return new Response(JSON.stringify({ markets: normalized, fetchedAt: Date.now() }), { headers: cors });
        } catch (error) {
          return new Response(JSON.stringify({ error: (error as Error).message }), { status: 502, headers: cors });
        }
      },
    },
  },
});

async function fetchGammaMarkets(): Promise<GammaMarket[]> {
  const now = new Date();
  const startMin = new Date(now.getTime() - 2 * 60 * 60_000).toISOString();
  const endMax = new Date(now.getTime() + 2 * 60 * 60_000).toISOString();
  const search = new URLSearchParams({
    limit: "500",
    active: "true",
    archived: "false",
    start_date_min: startMin,
    end_date_max: endMax,
    order: "endDate",
    ascending: "true",
  });
  const [marketsResponse, eventsResponse] = await Promise.all([
    fetch(`https://gamma-api.polymarket.com/markets?${search}`, { headers: { Accept: "application/json" } }),
    fetch(`https://gamma-api.polymarket.com/events?${search}`, { headers: { Accept: "application/json" } }),
  ]);
  if (!marketsResponse.ok) throw new Error(`gamma markets ${marketsResponse.status}`);
  const markets = (await marketsResponse.json()) as GammaMarket[];
  const fromEvents = eventsResponse.ok ? extractEventMarkets(await eventsResponse.json()) : [];
  const deduped = new Map<string, GammaMarket>();
  for (const market of [...markets, ...fromEvents]) {
    const key = market.conditionId ?? market.slug ?? market.id;
    if (key) deduped.set(key, market);
  }
  return Array.from(deduped.values());
}

function extractEventMarkets(events: unknown): GammaMarket[] {
  if (!Array.isArray(events)) return [];
  return events.flatMap((event) => {
    const markets = (event as { markets?: unknown }).markets;
    return Array.isArray(markets) ? (markets as GammaMarket[]) : [];
  });
}
