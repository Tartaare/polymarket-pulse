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
  const endMin = new Date(now.getTime() - 60 * 60_000).toISOString();
  const base = new URLSearchParams({
    limit: "500",
    active: "true",
    closed: "false",
    archived: "false",
    end_date_min: endMin,
    order: "endDate",
    ascending: "true",
  });
  const queries = [
    "bitcoin up down",
    "ethereum up down",
    "solana up down",
    "btc up down",
    "eth up down",
    "sol up down",
    "bitcoin up down 1 hour",
    "ethereum up down 1 hour",
    "solana up down 1 hour",
    "btc updown 1h",
    "eth updown 1h",
    "sol updown 1h",
    "btc-updown-1h",
    "eth-updown-1h",
    "sol-updown-1h",
  ];
  const urls = queries.flatMap((query) => {
    const search = new URLSearchParams(base);
    search.set("q", query);
    return [
      `https://gamma-api.polymarket.com/markets?${search}`,
      `https://gamma-api.polymarket.com/events?${search}`,
    ];
  });
  const responses = await Promise.allSettled(urls.map((url) => fetchJson<unknown>(url)));
  const markets: GammaMarket[] = [];
  const fromEvents: GammaMarket[] = [];
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    if (Array.isArray(response.value) && response.value.some((item) => "markets" in ((item as object) ?? {}))) {
      fromEvents.push(...extractEventMarkets(response.value));
    } else if (Array.isArray(response.value)) {
      markets.push(...(response.value as GammaMarket[]));
    }
  }
  if (markets.length === 0 && fromEvents.length === 0) {
    throw new Error("gamma returned no readable market payloads");
  }
  const deduped = new Map<string, GammaMarket>();
  for (const market of [...markets, ...fromEvents]) {
    const key = market.conditionId ?? market.slug ?? market.id;
    if (key) deduped.set(key, market);
  }
  return Array.from(deduped.values());
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${new URL(url).hostname} ${response.status}`);
  return (await response.json()) as T;
}

function extractEventMarkets(events: unknown): GammaMarket[] {
  if (!Array.isArray(events)) return [];
  return events.flatMap((event) => {
    const markets = (event as { markets?: unknown }).markets;
    return Array.isArray(markets) ? (markets as GammaMarket[]) : [];
  });
}
