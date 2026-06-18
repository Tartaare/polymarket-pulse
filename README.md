# Polysim

Application locale non-commerciale de paper trading pour les marchés crypto Up/Down de Polymarket.

## Présentation

`Polysim` propose un environnement de paper trading en temps réel pour trois actifs crypto : BTC, ETH et SOL.

- Marchés `Up` vs `Down` basés sur le prix spot Binance/USDT.
- Fenêtres de trading de 5 et 15 minutes.
- Carnet d'ordres simulé, exécution partielle et correspondance d'ordres.
- Portefeuille virtuel avec cash, positions, ordres ouverts et historique de trades.
- État persisté dans `localStorage` pour reprendre votre session.

## Fonctionnalités utilisateur

- Page `Markets` : liste des marchés en cours, filtres par actif et horizon, recherche.
- Page `Portfolio` : suivi de l'équité, cash, PnL, positions ouvertes, ordres ouverts, historique et positions fermées.
- Détail marché : graphique de prix, carnets d'ordres `UP` / `DOWN`, ticket d'ordre.
- Ordres pris en charge : `MARKET`, `LIMIT`, `FOK` et `LIMIT post-only`.
- Rachat manuel des positions gagnantes après résolution du marché.
- Réinitialisation du portefeuille à $10 000 disponible.

## Comment ça marche

### Marchés

- Trois actifs surveillés : `BTC`, `ETH`, `SOL`.
- Deux horizons : `5m` et `15m`.
- Chaque marché ouvre à l'instant courant aligné sur la fenêtre (`currentWindowOpen`).
- `priceToBeat` est le prix d'ouverture.
- Le marché se résout à la fin de la fenêtre : si le prix actuel est supérieur au `priceToBeat`, le résultat est `UP`, sinon `DOWN`.

### Prix et données

- Le client appelle `/api/prices` toutes les 2 secondes via la route serveur.
- La page exécute un `tick()` toutes les 500 ms pour mettre à jour les marchés ouverts, l'historique et les carnets d'ordres.
- Si Binance échoue, la route effectue une tentative de secours vers Coinbase.

### Carnet d'ordres

- Les carnets `UP` et `DOWN` sont construits en interne à partir d'une probabilité implicite de gain.
- Les ordres `MARKET` et `FOK` peuvent exécuter instantanément tout ou partie d'un ordre existant.
- Les ordres `LIMIT` reposent sur le carnet et peuvent se remplir partiellement au fil du temps.
- Les ordres `LIMIT post-only` sont refusés s'ils traversent le meilleur prix.

### Trading

- `BUY` : vous achetez des parts de l'issue choisie.
- `SELL` : vous vendez des parts que vous détenez déjà.
- Les coûts estimés, frais et liquidité sont affichés dans le ticket d'ordre.
- Le portefeuille réserve le cash nécessaire aux ordres en attente.

### Portefeuille

- `cash` : liquidités disponibles.
- `reserved` : cash bloqué pour ordres en attente.
- `positions` : parts détenues par marché et par issue.
- `orders` : ordres ouverts, partiellement remplis ou annulés.
- `fills` : historique des exécutions.
- Les positions gagnantes peuvent être rachetées après résolution pour convertir en cash.

## Installation

1. Clonez le dépôt.
2. Ouvrez le dossier du projet.
3. Installez les dépendances :

```bash
npm install
```

4. Lancez l'application en local :

```bash
npm run dev
```

5. Ouvrez le navigateur sur l'URL indiquée par Vite, généralement `http://localhost:5173`.

## Scripts utiles

- `npm run dev` : démarre le serveur de développement Vite.
- `npm run build` : génère le build de production.
- `npm run preview` : prévisualise le build de production.
- `npm run lint` : lance ESLint sur le code.
- `npm run format` : formate le code avec Prettier.

## Architecture principale

### Routes

- `src/routes/index.tsx` : page de navigation et filtres des marchés.
- `src/routes/market.$marketId.tsx` : page de détail d'un marché.
- `src/routes/portfolio.tsx` : vue portefeuille et historique.
- `src/routes/api.prices.ts` : route serveur pour récupérer les prix spot.
- `src/routes/__root.tsx` : shell global de l'application.

### Simulation

- `src/lib/store/sim-store.ts` : store global, persistance, cycle de vie du marché, ordre et portefeuille.
- `src/lib/store/use-sim-engine.ts` : initialisation du flux de prix et du tick loop.
- `src/lib/feed/binance-ws.ts` : collecte des prix spot via l'API serveur.
- `src/lib/sim/resolution.ts` : logique de création et de résolution des marchés.
- `src/lib/sim/orderbook.ts` : génération des carnets d'ordres simulés.
- `src/lib/sim/matching.ts` : matching des ordres, frais, coût estimé.
- `src/lib/sim/portfolio.ts` : appliqué des fills, calcul des réserves et PnL.

### Composants UI

- `src/components/market/MarketCard.tsx` : vignette marché.
- `src/components/market/OrderTicket.tsx` : formulaire de placement d'ordre.
- `src/components/market/OrderBookTable.tsx` : carnet d'ordres.
- `src/components/market/PriceChart.tsx` : graphique de prix.
- `src/components/market/Countdown.tsx` : compte à rebours de clôture.

## Notes importantes

- Il s'agit d'une application de paper trading : aucun ordre réel n'est envoyé sur Binance.
- Le portefeuille est virtuel et commence avec `$10 000`.
- L'état est stocké dans `localStorage` sous la clé `polysim-v1`.
- La logique de marché est déterministe pour chaque fenêtre temporelle et ne reflète pas un marché réel.

## Développement

- Le projet utilise React 19, TypeScript, Vite, Tailwind CSS, et TanStack Start/Router.
- `routeTree.gen.ts` est auto-généré : ne pas modifier manuellement.
- Le code dépend fortement du store global `useSimStore` et de la boucle de tick côté client.

## À améliorer / idées

- Ajouter une authentification ou un multi-utilisateur.
- Ajouter des marchés supplémentaires ou des actifs tokenisés.
- Affiner la logique de carnet d'ordres et le calcul des probabilités.
- Visualiser les frais et la performance par trade.
