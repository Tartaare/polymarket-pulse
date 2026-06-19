import { normalizeGammaMarket } from './src/lib/polymarket/normalize';

async function test() {
  const url = 'https://gamma-api.polymarket.com/events?slug=bitcoin-up-or-down-june-19-2026-7am-et';
  const res = await fetch(url).then(r => r.json());
  const event = res[0];
  const market = event.markets[0];
  market.tags = event.tags; // simulate our extraction
  const norm = normalizeGammaMarket(market);
  console.log('Normalized:', norm ? norm.windowMin : null);
}
test();
