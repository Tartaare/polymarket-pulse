import { createFileRoute } from "@tanstack/react-router";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/polymarket/resolved")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const conditionIds = (url.searchParams.get("conditionIds") ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);

          if (conditionIds.length === 0) {
            return new Response(JSON.stringify({ resolved: {} }), { headers: cors });
          }

          // Gamma API supports fetching by multiple condition_ids comma-separated
          const gammaUrl = `https://gamma-api.polymarket.com/markets?condition_ids=${encodeURIComponent(conditionIds.join(","))}`;
          const response = await fetch(gammaUrl, { headers: { Accept: "application/json" } });
          if (!response.ok) {
            throw new Error(`Gamma API error: ${response.status}`);
          }
          const markets = (await response.json()) as any[];

          const resolved: Record<string, { resolved: boolean; winningOutcome?: "UP" | "DOWN"; closed: boolean }> = {};
          
          for (const m of markets) {
            const conditionId = m.conditionId;
            if (!conditionId) continue;
            
            const closed = m.closed === true;
            const hasPayouts = Array.isArray(m.payouts);
            let winningOutcome: "UP" | "DOWN" | undefined;
            
            if (closed) {
              if (hasPayouts) {
                const p0 = Number(m.payouts[0]);
                const p1 = Number(m.payouts[1]);
                if (p0 > p1) {
                  winningOutcome = "UP"; // Index 0 wins (typically UP/YES)
                } else if (p1 > p0) {
                  winningOutcome = "DOWN"; // Index 1 wins (typically DOWN/NO)
                }
              }
              
              if (!winningOutcome && m.resolvedOutcome !== undefined && m.resolvedOutcome !== null) {
                const outcomeStr = String(m.resolvedOutcome).toLowerCase();
                if (outcomeStr === "0" || outcomeStr.includes("up") || outcomeStr.includes("yes")) {
                  winningOutcome = "UP";
                } else if (outcomeStr === "1" || outcomeStr.includes("down") || outcomeStr.includes("no")) {
                  winningOutcome = "DOWN";
                }
              }
              
              resolved[conditionId] = {
                resolved: winningOutcome !== undefined,
                winningOutcome,
                closed: true
              };
            } else {
              resolved[conditionId] = {
                resolved: false,
                closed: false
              };
            }
          }

          return new Response(JSON.stringify({ resolved, fetchedAt: Date.now() }), { headers: cors });
        } catch (error) {
          console.error("GET /api/polymarket/resolved error:", error);
          return new Response(JSON.stringify({ error: (error as Error).message }), { status: 502, headers: cors });
        }
      },
    },
  },
});
