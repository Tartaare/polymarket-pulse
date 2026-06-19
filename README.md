# Polysim

Application locale non-commerciale de paper trading pour s'entraîner sur les vrais marchés crypto Up/Down de Polymarket.

## Présentation

`Polysim` utilise les APIs publiques Polymarket pour découvrir les marchés crypto Up/Down, maintenir les carnets CLOB en temps réel et simuler des ordres paper contre la liquidité visible.

- Discovery Gamma API / Events API pour BTC, ETH et SOL.
- Horizons `5m`, `15m` et `1h` quand ils existent sur Polymarket.
- Carnets CLOB réels via REST bootstrap et WebSocket market channel.
- Paper execution locale : `MARKET`, `LIMIT`, `FOK`, `FAK`, `GTC`, `GTD`, post-only, partial fills.
- Frais par token via `/fee-rate`, avec fallback sur les champs marché Gamma.
- Portefeuille virtuel persisté en IndexedDB : ordres, fills, positions, equity curve et snapshots récents.
- Documentation détaillée du système marchés : `market.md`.

## Fonctionnalités utilisateur

- Page `Markets` : filtres par actif, horizon, statut et recherche slug/question/token.
- Page détail marché : conditionId, token IDs, état CLOB, bid/ask, spread, mid, liquidité visible et derniers fills paper.
- Ticket d'ordre : estimation coût/produit, frais, slippage, break-even, expiration GTD et validation post-only.
- Page `Portfolio` : cash, réservé, PnL brut/net, frais, positions, ordres ouverts, historique et export CSV.
- Rachat paper des positions après résolution reçue depuis le WebSocket Polymarket.

## Comment ça marche

### Marchés

- Le client appelle `/api/polymarket/markets`.
- La route serveur interroge `https://gamma-api.polymarket.com/markets` et `https://gamma-api.polymarket.com/events`.
- Les marchés sont normalisés avec `slug`, `conditionId`, `clobTokenIds`, `startDate`, `endDate`, `active`, `closed`, `archived`, `outcomes` et `outcomePrices`.
- Les statuts sont dérivés localement : `upcoming`, `live`, `closing`, `resolved`.
- Aucun marché n'est généré localement par fenêtre temporelle.

### Carnets CLOB

- `/api/polymarket/books` bootstrap les carnets via `https://clob.polymarket.com/book`.
- Le navigateur souscrit à `wss://ws-subscriptions-clob.polymarket.com/ws/market` par token ID.
- Les événements gérés sont `book`, `price_change`, `last_trade_price`, `best_bid_ask`, `new_market` et `market_resolved`.
- Les carnets locaux recalculent best bid, best ask, spread, mid et liquidité visible.

### Paper trading

- `MARKET BUY` consomme les asks.
- `MARKET SELL` consomme les bids.
- `LIMIT` peut reposer ou s'exécuter si marketable.
- `FOK` exige le remplissage complet immédiat.
- `FAK` accepte un remplissage partiel immédiat.
- `GTC` reste ouvert jusqu'à annulation/résolution.
- `GTD` expire à l'heure choisie.
- Les statuts d'ordre sont `OPEN`, `PARTIALLY_FILLED`, `FILLED`, `CANCELLED`, `EXPIRED`, `REJECTED`.

### Frais et PnL

- Les frais taker utilisent `fee = shares * feeRate * price * (1 - price)`.
- Les frais sont arrondis à 5 décimales.
- Le portefeuille suit PnL brut, PnL net, ROI implicite, break-even, frais payés et payout attendu.

### Persistance

- IndexedDB stocke l'état applicatif courant sous `polysim-polymarket-v1`.
- Les snapshots de carnet récents sont conservés pour replay v1 local.
- Une migration douce lit l'ancienne clé `localStorage` `polysim-v1` si IndexedDB est vide.

## Installation

1. Installez les dépendances :

```bash
npm install
```

2. Lancez l'application :

```bash
npm run dev
```

3. Ouvrez l'URL Vite indiquée, généralement `http://localhost:5173`.

## Scripts utiles

- `npm run dev` : serveur de développement.
- `npm run build` : build de production.
- `npm run preview` : prévisualisation du build.
- `npm run lint` : ESLint.
- `npm run format` : Prettier.
- `npx tsc --noEmit` : vérification TypeScript.
- `npm run test` : vérification live de la discovery Polymarket avec certificats système.

## Architecture principale

### Routes

- `src/routes/index.tsx` : discovery et filtres marchés.
- `src/routes/market.$marketId.tsx` : détail marché, carnets et ticket d'ordre.
- `src/routes/portfolio.tsx` : portefeuille, PnL, export CSV.
- `src/routes/api.polymarket.markets.ts` : proxy Gamma markets/events.
- `src/routes/api.polymarket.books.ts` : proxy CLOB books.
- `src/routes/api.polymarket.fees.ts` : proxy fee rates.

### Domaine

- `src/lib/polymarket/normalize.ts` : parsing et normalisation Gamma.
- `src/lib/feed/polymarket-clob-ws.ts` : WebSocket market channel.
- `src/lib/sim/orderbook.ts` : reducers de carnets CLOB.
- `src/lib/sim/matching.ts` : moteur paper pur.
- `src/lib/sim/portfolio.ts` : positions, réserves et PnL.
- `src/lib/store/sim-store.ts` : orchestration discovery, CLOB, ordres et portefeuille.
- `src/lib/store/indexed-db.ts` : persistance IndexedDB.

## Notes importantes

- Aucun ordre réel n'est envoyé à Polymarket.
- Aucun wallet, aucune signature et aucune clé API utilisateur ne sont utilisés.
- L'application dépend des APIs publiques Polymarket et peut être limitée par réseau, CORS proxy local ou disponibilité API.
- Les snapshots replay sont locaux et limités; un replay analytique complet reste un sprint séparé.
