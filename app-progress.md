# SPRINT 1 - Vrais marchés Polymarket + CLOB paper trading

# Date :
2026-06-19

# Statut :
Terminé côté implémentation locale. Validation TypeScript effectuée; build production à exécuter en fin de sprint.

# Composants :
- Discovery Polymarket via routes serveur `/api/polymarket/markets`, `/api/polymarket/books`, `/api/polymarket/fees`.
- Modèle typé Polymarket : `WindowMin = 5 | 15 | 60`, statuts `upcoming/live/closing/resolved`, conditionId et token IDs CLOB.
- WebSocket CLOB market channel avec `book`, `price_change`, `last_trade_price`, `new_market`, `market_resolved`.
- Moteur paper contre carnet réel : market, limit, FOK, FAK, GTC, GTD, post-only, partial fills, annulation, expiration.
- Frais taker par token, PnL brut/net, break-even et equity curve.
- IndexedDB v1 pour portefeuille, ordres, fills, marchés et snapshots de books.
- UI Markets, Market detail, Order Ticket et Portfolio alignée sur le design dark trading.

# Validation :
- `npx tsc --noEmit` : OK.
- Self-checks TypeScript ajoutés pour parsing Gamma, reducer CLOB, execution paper et frais.

# Risques restants :
- Les slugs crypto Up/Down 1h dépendent de ce que Gamma expose réellement au moment du scan.
- Le WebSocket Polymarket peut être indisponible ou rate-limité; le bootstrap REST garde un fallback initial.
- Les snapshots replay sont volontairement limités à une base locale v1, pas à un moteur replay analytique complet.

# Commentaires :
- Les anciens marchés locaux `currentWindowOpen`, le feed Binance/Coinbase et le carnet synthétique ont été retirés du runtime.
- Aucun wallet et aucun ordre réel ne sont utilisés; le simulateur reste strictement paper.

---

# SPRINT 2 - Correction ouverture détail marché

# Date :
2026-06-19

# Statut :
Terminé.

# Correction :
- Suppression d'un sélecteur `useSyncExternalStore` instable dans la page détail marché.
- Le filtrage des derniers fills paper est désormais dérivé via `useMemo` depuis la référence stable `portfolio.fills`.
- Typage strict du panneau carnet avec `OutcomeBook` au lieu de `any`.

# Validation :
- `npx tsc --noEmit` : OK.
- `npm run build` : OK.

# Risques restants :
- Aucun impact sur IndexedDB, le moteur paper trading ou les routes API.

---

# SPRINT 3 - Vérification marchés 5m/15m/1h + documentation système

# Date :
2026-06-19

# Statut :
Terminé.

# Vérification :
- Validation live relancée avec `npm run test` corrigé pour exécuter Node avec `--use-system-ca`.
- Les marchés actifs récupérés depuis Gamma passent bien la normalisation et restent limités à `BTC`, `ETH`, `SOL` et aux fenêtres `5m`, `15m`, `1h`.
- Validation observée le `2026-06-19` : des marchés `5m`, `15m` et `1h` étaient bien actifs, dont `bitcoin-up-or-down-june-19-2026-8am-et`.
- Le normaliseur couvre désormais explicitement les cas où `1h` n'est pas dans le `slug` ni la `question`, mais seulement dans les `tags`, la `description` ou `eventStartTime`.
- Correction TypeScript locale sur `vite.config.ts` pour rétablir `npx tsc --noEmit` et le build.

# Documentation :
- Ajout de `market.md` pour décrire précisément la discovery, la normalisation, les carnets, le WebSocket CLOB, le paper trading et les limites opérationnelles.

# Validation :
- `npm run test` : OK.
- `npx tsc --noEmit` : OK.
- `npm run build` : OK.

---

# SPRINT 4 - Migration SQLite + Fidélité Polymarket

# Date :
2026-06-25

# Statut :
Terminé.

# Composants & Améliorations :
- **SQLite server-side** : Remplacement d'IndexedDB par SQLite (`better-sqlite3`) avec un schéma complet et persistance par transaction atomique. Migration douce de l'ancienne base IndexedDB vers SQLite au premier chargement client.
- **Types d'ordres Polymarket** : Unification sous `PolymarketOrderType` ("GTC", "GTD", "FOK", "FAK"). Simplification de l'Order Ticket UI à un select unique de 5 options sans combinaisons absurdes.
- **Reliquat FAK** : Annulation automatique du reste non exécuté des ordres FAK avec affectation du statut "FILLED" et conservation de la taille annulée dans `cancelledRemainder`.
- **Validation Tick Size** : Validation stricte des prix limites au tick size du marché et snap au step correct dans l'input UI du ticket d'ordre.
- **Résolution Enrichie** : Distinction entre expiration (`ENDED`), attente (`AWAITING_RESOLUTION`) et confirmation Gamma (`RESOLVED`). Annulation automatique des ordres ouverts sur les marchés expirés.
- **Discovery Résolution Gamma** : Polling robuste via `/api/polymarket/resolved` pour les marchés en portefeuille expirés depuis > 30s. Conservation des marchés terminés actifs dans le store lors des scans.
- **Shadow Book** : Simulation et mise à jour de la liquidité virtuelle locale après chaque fill paper pour empêcher le double-spend de liquidité avant réception du tick CLOB.
- **Réserves Cash avec Frais** : Inclusion des frais taker estimés dans les réserves bloquées des ordres d'achat ouverts.
- **Events CLOB étendus** : Gestion et dispatch dans le store des événements WebSocket `best_bid_ask` et `tick_size_change`.

# Validation :
- `npx tsc --noEmit` : OK.
- `npm run test` : OK.
- `npm run build` : OK.

---

# SPRINT 5 - UI/UX Polymarket Up/Down Crypto

# Date :
2026-06-25

# Statut :
Terminé.

# Composants & Améliorations :
- **Source de données de résolution** : Connexion au WebSocket Polymarket RTDS (`wss://ws-live-data.polymarket.com` via topic `crypto_prices_chainlink`) comme source de prix faisant foi pour le sous-jacent (BTC/ETH/SOL/XRP) avec fallback Binance si nécessaire.
- **Visualisations graphiques** : Remplacement du graphique existant par TradingView Lightweight Charts supportant 3 modes : probabilités UP (0-100%), ligne de prix du sous-jacent, et chandeliers japonais (bougies 1m cumulées à la volée).
- **Ligne cible et label flottant** : Traçage de la ligne cible (strike price à battre) avec un label "target" flottant qui suit le Y-coordinate de la cible et affiche une flèche adaptative (▼ vers le bas si le prix actuel est au-dessus du target, ▲ vers le haut si le prix actuel est en dessous).
- **Fuseau horaire personnalisé** : Intégration d'un hook `useTimezone` persistant en localStorage et d'un sélecteur (ET vs local) dans le Header. Tous les affichages de dates et d'intervalles de marchés s'adaptent dynamiquement au fuseau de l'utilisateur.
- **Refonte Ticket d'Ordre** : Implémentation de 3 modes dans le ticket (Limite avec calculatrice bidirectionnelle shares/dollars et paliers de 1¢, Marché avec presets, 1-Tap buy montrant directement les gains potentiels) et CTA explicites (Acheter UP / Vendre DOWN).
- **Navigation & Sidebar** : Barre de navigation temporelle (Passé déroulant avec sens de résolution, pills horaires de position active, bouton Live et More) et sidebar de scannage des opportunités live d'autres marchés.
- **Dual-Theme Support** : Ajout du mode Jour (palette claire) en plus du mode Nuit (palette sombre par défaut), avec synchronisation en direct des arrière-plans et des grilles de graphiques TradingView via un MutationObserver sur la classe du document HTML.

# Validation :
- `npx tsc --noEmit` : OK.
- `npm run test` : OK.
- `npm run build` : OK.

---

# SPRINT 6 - Correction diagnostics CSS Tailwind v4

# Date :
2026-06-25

# Statut :
Terminé.

# Correction :
- Remplacement de la directive d'import Tailwind de `@import "tailwindcss" source(none);` par `@import "tailwindcss";` pour rester compatible avec l'analyseur CSS standard de l'éditeur.
- Ajout d'une configuration workspace VS Code `.vscode/settings.json` avec `css.lint.unknownAtRules = ignore` pour éviter les faux positifs sur les directives Tailwind v4 (`@source`, `@theme`, `@utility`, `@custom-variant`).

# Validation :
- `npx tsc --noEmit` : OK.
- `npm run build` : OK.

# Risques restants :
- Les diagnostics CSS réapparaîtront si le fichier est ouvert dans un éditeur qui ignore la configuration workspace ou si les directives Tailwind v4 sont analysées sans support Tailwind.

---

# SPRINT 7 - Correction refresh SSR timezone

# Date :
2026-06-25

# Statut :
Terminé.

# Correction :
- Suppression du chargement `require()` dans `src/routes/__root.tsx` utilisé par `TimezoneToggle`.
- Import direct du hook `useTimezone`, déjà compatible SSR grâce à son garde-fou `typeof window === "undefined"`.
- Le rechargement navigateur ne déclenche plus l'exception serveur `ReferenceError: require is not defined`.

# Validation :
- `npx tsc --noEmit` : OK.
- `npm run build` : OK.
- Requête locale sur `http://127.0.0.1:5173/` en mode dev : `200`.

# Risques restants :
- Aucun identifié sur le flux timezone; le correctif reste localisé au shell racine SSR.

---

# SPRINT 8 - Correction refresh boucle page marché

# Date :
2026-06-25

# Statut :
Terminé.

# Correction :
- Ajout d'une exclusion Vite `**/.data/**` pour empêcher les écritures SQLite (`polysim.db`, WAL/SHM) de déclencher un full reload navigateur en développement.
- Réduction de la persistance `/api/state` aux changements métier persistables (`markets`, `portfolio`) au lieu de chaque tick temps réel.
- Conservation des mises à jour de carnet en mémoire live et des snapshots dédiés, sans écrire l'état applicatif complet à chaque seconde.

# Validation :
- `npx tsc --noEmit` : OK.
- `npm run build` : OK.
- `npm run test` : OK.

# Risques restants :
- Les snapshots de carnet restent écrits périodiquement dans SQLite, mais `.data/**` est ignoré par le watcher Vite.
