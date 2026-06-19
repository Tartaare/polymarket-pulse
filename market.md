# Système Marchés Polymarket

## Objectif

`Polysim` ne fabrique pas de marchés synthétiques. L'application consomme les vrais marchés Polymarket, filtre uniquement les marchés crypto `Up/Down`, puis exécute un paper trading local contre les carnets CLOB visibles.

Le système cible exclusivement :

- actifs `BTC`, `ETH`, `SOL`
- horizons `5m`, `15m`, `1h`
- source `Gamma API` pour la discovery
- source `CLOB REST + WebSocket` pour les carnets

## Vue d'ensemble

Le pipeline suit cet ordre :

1. Le client appelle `/api/polymarket/markets`.
2. La route serveur interroge `https://gamma-api.polymarket.com/markets` et `https://gamma-api.polymarket.com/events`.
3. Les payloads sont dédupliqués par `conditionId`, puis normalisés en `Market`.
4. Les marchés normalisés sont stockés côté client.
5. Le détail marché déclenche le bootstrap du carnet via `/api/polymarket/books`.
6. Le navigateur s'abonne ensuite au WebSocket `wss://ws-subscriptions-clob.polymarket.com/ws/market`.
7. Le moteur paper exécute les ordres localement à partir du carnet maintenu en mémoire.

## Discovery Gamma

Fichier principal : `src/routes/api.polymarket.markets.ts`

La route serveur envoie deux requêtes :

- `GET https://gamma-api.polymarket.com/markets?...`
- `GET https://gamma-api.polymarket.com/events?...`

Paramètres utilisés :

- `limit=100`
- `active=true`
- `closed=false`
- `archived=false`
- `end_date_min=<now - 1h>`
- `order=endDate`
- `ascending=true`

Pourquoi deux endpoints :

- `markets` donne les marchés directement.
- `events` permet de récupérer des marchés imbriqués avec des tags d'événement utiles à l'inférence d'horizon.

Déduplication :

- clé prioritaire `conditionId`
- fallback `slug`
- fallback `id`

Si les deux endpoints renvoient zéro payload exploitable, la route renvoie une `502`.

## Normalisation d'un marché

Fichier principal : `src/lib/polymarket/normalize.ts`

Un payload Gamma n'est retenu que si les champs suivants sont exploitables :

- `slug`
- `conditionId`
- au moins 2 `outcomes`
- au moins 2 `clobTokenIds`
- `endDate` ou `endDateIso`
- actif détectable `BTC`, `ETH` ou `SOL`
- fenêtre détectable `5`, `15` ou `60`

### Détection de l'actif

L'actif est inféré depuis `slug + question`.

Règles :

- présence de `BTC` ou `BITCOIN` => `BTC`
- présence de `ETH` ou `ETHEREUM` => `ETH`
- présence de `SOL` ou `SOLANA` => `SOL`

Tout autre marché est rejeté.

### Détection de l'horizon

La fenêtre est inférée dans cet ordre :

1. tags d'événement
2. regex sur `slug + question + description`
3. calcul `endDate - startDate`, avec priorité à `eventStartTime` si présent

Mapping :

- tag `5m` => `5`
- tag `15m` => `15`
- tag `1h` => `60`

Regex supportées :

- `5m`, `5-min`, `5 min`, `5-minute`, `5 minute`
- `15m`, `15-min`, `15 min`, `15-minute`, `15 minute`
- `1h`, `1-hour`, `1 hour`, `60m`, `60 min`, `60-minute`

Fallback par durée :

- si `startDate` et `endDate` existent, la durée en minutes est arrondie
- la valeur est acceptée si elle est à `±1 minute` de `5`, `15` ou `60`

Ce fallback est important car certains marchés actifs n'affichent pas explicitement `5m/15m/1h` dans le slug.

Exemple réel observé le `2026-06-19` :

- `bitcoin-up-or-down-june-19-2026-8am-et`
- la `question` ne contient pas `1h`
- l'information horaire apparaît via le tag `1H`, la `description` (“1 hour candle”) et `eventStartTime`

Le normaliseur doit donc utiliser plus que le seul `slug`.

### Mapping des issues

Le système ramène tout marché à deux issues internes :

- `UP`
- `DOWN`

Le mapping repose d'abord sur le texte :

- `up`, `yes`, `above`, `higher` => `UP`
- `down`, `no`, `below`, `lower` => `DOWN`

Fallback :

- si seulement 2 issues existent et qu'aucune regex ne matche, l'index `0` devient `UP` et l'index `1` devient `DOWN`

### Dates et statuts

Le statut Polymarket interne est calculé localement :

- `resolved` si `closed`, `archived`, `active=false` ou `now >= endDate`
- `upcoming` si `now < startDate`
- `closing` si `endDate - now <= 60s`
- `live` sinon

Mapping UI :

- `upcoming` => `UPCOMING`
- `live` => `LIVE`
- `closing` => `CLOSING`
- `resolved` => `RESOLVED`

Si `startDate` manque, il est reconstruit par :

- `endDate - windowMin`

## Structure interne d'un marché

Le modèle final contient notamment :

- `id`
- `slug`
- `question`
- `conditionId`
- `asset`
- `windowMin`
- `startDate`
- `endDate`
- `status`
- `state`
- `clobTokenIds.UP`
- `clobTokenIds.DOWN`
- `outcomePrices.UP`
- `outcomePrices.DOWN`
- `tickSize`
- `orderMinSize`
- `feeRateBps`
- `feeSchedule`
- `volume`
- `liquidity`

## Carnets CLOB

Routes et modules :

- `src/routes/api.polymarket.books.ts`
- `src/lib/sim/orderbook.ts`
- `src/lib/feed/polymarket-clob-ws.ts`

Bootstrap :

- l'application appelle le proxy `/api/polymarket/books`
- le proxy récupère le carnet réel via `https://clob.polymarket.com/book`

Streaming :

- le navigateur s'abonne au WebSocket `wss://ws-subscriptions-clob.polymarket.com/ws/market`
- abonnement par `tokenId`

Événements gérés :

- `book`
- `price_change`
- `last_trade_price`
- `best_bid_ask`
- `new_market`
- `market_resolved`

À partir de ces événements, le reducer local maintient :

- les niveaux `bids`
- les niveaux `asks`
- `bestBid`
- `bestAsk`
- `spread`
- `mid`
- la liquidité visible

## Paper trading

Le simulateur ne signe rien et n'envoie rien à Polymarket.

Fichiers principaux :

- `src/lib/sim/matching.ts`
- `src/lib/sim/portfolio.ts`
- `src/lib/store/sim-store.ts`

Règles principales :

- `MARKET BUY` consomme les asks
- `MARKET SELL` consomme les bids
- un `LIMIT` marketable s'exécute immédiatement
- un `LIMIT` non marketable peut rester au carnet local
- `FOK` exige un remplissage complet immédiat
- `FAK` autorise un partiel immédiat puis annule le reliquat
- `GTC` reste ouvert
- `GTD` expire à la date choisie
- `postOnly` rejette un ordre qui croiserait immédiatement le spread

Statuts supportés :

- `OPEN`
- `PARTIALLY_FILLED`
- `FILLED`
- `CANCELLED`
- `EXPIRED`
- `REJECTED`

## Frais

Source des frais :

- `takerBaseFee` Gamma si disponible
- sinon `feeSchedule`
- sinon fallback `700 bps`

Si `feesEnabled=false`, les frais sont forcés à `0`.

Formule taker utilisée :

- `fee = shares * feeRate * price * (1 - price)`

Les frais sont arrondis à `5` décimales.

## Persistance

Stockage :

- IndexedDB `polysim-polymarket-v1`

Contenu stocké :

- portefeuille virtuel
- ordres
- fills
- positions
- marchés
- snapshots récents de books

Compatibilité :

- migration douce depuis `localStorage` clé `polysim-v1` si IndexedDB est vide

## Comportement actuel vérifié

Validation effectuée le `2026-06-19`.

Résultats constatés :

- `npm run test` valide la récupération live Gamma et la normalisation des marchés actifs
- les marchés actifs remontés pendant le test étaient tous cohérents avec `BTC/ETH/SOL` et les fenêtres autorisées
- des marchés `5m` et `15m` étaient présents en live au moment du test
- aucun marché `1h` actif n'était remonté dans cet échantillon précis
- l'inférence `1h` a été confirmée séparément sur un payload horaire compatible Polymarket

Conclusion précise :

- le système supporte `5m`, `15m`, `1h`
- la présence live d'un horizon dépend de ce que Polymarket publie à l'instant du scan
- l'absence de `1h` dans un échantillon live n'est pas une régression si la normalisation et l'UI acceptent toujours `60`

## Limites connues

- la discovery dépend entièrement des payloads publics Gamma
- les marchés non crypto ou non binaires sont volontairement rejetés
- l'horizon horaire peut être absent du flux live à certains moments
- le test live dépend de l'accès TLS système, d'où l'usage de `--use-system-ca`
- si Gamma ou le WebSocket CLOB changent de contrat, la normalisation et les reducers devront être ajustés
