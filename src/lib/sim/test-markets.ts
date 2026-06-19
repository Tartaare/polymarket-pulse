import { normalizeGammaMarket, type GammaMarket } from "../polymarket/normalize";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${new URL(url).hostname} ${response.status}`);
  return (await response.json()) as T;
}

function extractEventMarkets(events: unknown): GammaMarket[] {
  if (!Array.isArray(events)) return [];
  return events.flatMap((event) => {
    const ev = event as { markets?: unknown; tags?: { slug?: string }[] };
    const markets = ev.markets;
    if (!Array.isArray(markets)) return [];
    return markets.map((market) => ({ ...(market as GammaMarket), tags: ev.tags }));
  });
}

async function fetchGammaMarkets(): Promise<GammaMarket[]> {
  const now = new Date();
  const endMin = new Date(now.getTime() - 60 * 60_000).toISOString();
  const base = new URLSearchParams({
    limit: "100",
    active: "true",
    closed: "false",
    archived: "false",
    end_date_min: endMin,
    order: "endDate",
    ascending: "true",
  });
  const urls = [
    `https://gamma-api.polymarket.com/markets?${base}`,
    `https://gamma-api.polymarket.com/events?${base}`,
  ];
  const responses = await Promise.allSettled(urls.map((url) => fetchJson<unknown>(url)));
  const markets: GammaMarket[] = [];
  const fromEvents: GammaMarket[] = [];

  if (responses[0].status === "fulfilled" && Array.isArray(responses[0].value)) {
    markets.push(...(responses[0].value as GammaMarket[]));
  }
  if (responses[1].status === "fulfilled" && Array.isArray(responses[1].value)) {
    fromEvents.push(...extractEventMarkets(responses[1].value));
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

async function runTest() {
  console.log("=== DÉBUT DU TEST DES MARCHÉS POLYMARKET ===");
  console.log("1. Récupération des marchés depuis l'API Gamma...");
  
  let rawMarkets: GammaMarket[];
  try {
    rawMarkets = await fetchGammaMarkets();
    console.log(`✓ ${rawMarkets.length} marchés bruts récupérés.`);
  } catch (error) {
    console.error("❌ Échec de la récupération des marchés:", error);
    process.exit(1);
  }

  console.log("2. Normalisation et filtrage des marchés...");
  const normalized = rawMarkets
    .map((m) => normalizeGammaMarket(m))
    .filter((m) => m !== null);

  console.log(`✓ ${normalized.length} marchés après normalisation.`);

  if (normalized.length === 0) {
    console.error("❌ Erreur : Aucun marché n'a été trouvé après normalisation !");
    console.error("Ceci est anormal car Polymarket a en permanence des marchés crypto UP/DOWN actifs.");
    process.exit(1);
  }

  console.log("3. Validation des critères de filtrage...");
  const validAssets = new Set(["BTC", "ETH", "SOL"]);
  const validWindows = new Set([5, 15, 60]);

  let failures = 0;

  for (const market of normalized) {
    console.log(`\nAnalyse du marché : "${market.question}"`);
    console.log(`  ID: ${market.id}`);
    console.log(`  Asset: ${market.asset}`);
    console.log(`  Fenêtre (min): ${market.windowMin}`);
    console.log(`  Token UP: ${market.clobTokenIds.UP}`);
    console.log(`  Token DOWN: ${market.clobTokenIds.DOWN}`);

    // Validation Asset
    if (!validAssets.has(market.asset)) {
      console.error(`  ❌ ERREUR: Asset invalide "${market.asset}". Attendus: BTC, ETH, SOL.`);
      failures++;
    } else {
      console.log(`  ✓ Asset valide.`);
    }

    // Validation Window
    if (!validWindows.has(market.windowMin)) {
      console.error(`  ❌ ERREUR: Fenêtre de temps invalide "${market.windowMin}". Attendues: 5, 15, 60.`);
      failures++;
    } else {
      console.log(`  ✓ Fenêtre valide.`);
    }

    // Validation UP/DOWN Token IDs
    if (!market.clobTokenIds.UP || !market.clobTokenIds.DOWN) {
      console.error(`  ❌ ERREUR: Tokens CLOB manquants.`);
      failures++;
    } else {
      console.log(`  ✓ Tokens CLOB présents.`);
    }

    // Validation du statut actif
    if (market.closed || !market.active) {
      console.error(`  ❌ ERREUR: Le marché n'est pas actif (closed: ${market.closed}, active: ${market.active}).`);
      failures++;
    } else {
      console.log(`  ✓ Statut actif.`);
    }
  }

  console.log("\n=================================");
  if (failures > 0) {
    console.error(`❌ TEST ÉCHOUÉ : ${failures} erreur(s) détectée(s).`);
    process.exit(1);
  } else {
    console.log("🎉 TEST RÉUSSI : Tous les marchés récupérés sont conformes !");
    console.log("Uniquement des marchés crypto (BTC/ETH/SOL) UP/DOWN de 5min, 15min ou 1h.");
    process.exit(0);
  }
}

runTest();
