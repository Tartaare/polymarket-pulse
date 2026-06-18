import { createFileRoute } from "@tanstack/react-router";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/prices")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async () => {
        const symbolsParam = encodeURIComponent(JSON.stringify(SYMBOLS));
        const url = `https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`;
        try {
          const r = await fetch(url, { headers: { Accept: "application/json" } });
          if (!r.ok) throw new Error(`binance ${r.status}`);
          const data = await r.json();
          return new Response(JSON.stringify(data), { headers: cors });
        } catch (e) {
          // Coinbase fallback
          try {
            const pairs = [["BTC", "BTC-USD"], ["ETH", "ETH-USD"], ["SOL", "SOL-USD"]];
            const results = await Promise.all(
              pairs.map(async ([asset, pair]) => {
                const r = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`);
                const j: any = await r.json();
                return { symbol: `${asset}USDT`, price: j?.data?.amount ?? "0" };
              })
            );
            return new Response(JSON.stringify(results), { headers: cors });
          } catch (err) {
            return new Response(
              JSON.stringify({ error: (err as Error).message }),
              { status: 502, headers: cors }
            );
          }
        }
      },
    },
  },
});
