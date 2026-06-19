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
