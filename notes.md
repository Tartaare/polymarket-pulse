# TO DO




## DONE



L’app n’est pas une vraie app de paper trading Polymarket. C’est plutôt un simulateur crypto Up/Down maison, basé sur le prix spot Binance/Coinbase, avec carnet d’ordres synthétique. Pour notre objectif — s’entraîner sur les vrais marchés Polymarket crypto Up/Down 5m/15m/1h — elle est trop éloignée de la réalité.

Modifications:

1. Remplacer le marché synthétique par le vrai market discovery Polymarket

À faire :

scanner Gamma API / Events API pour trouver les vrais marchés crypto Up/Down actifs ;
récupérer slug, conditionId, clobTokenIds, startDate, endDate, closed, active, archived, outcomes, outcomePrices ;
gérer 5m, 15m et 1h ;
distinguer : upcoming, live, closing, resolved.

Le code Lovable actuel crée les marchés avec currentWindowOpen; ça doit disparaître.

2. Remplacer le carnet synthétique par le CLOB réel

Polymarket fournit un WebSocket market channel pour snapshots, price changes, trades et événements de marché.

À implémenter :

subscribe par asset_id / token ID ;
maintenir un vrai order book local ;
gérer book, price_change, last_trade_price, best_bid_ask, market_resolved ;
recalculer bid/ask, spread, mid, liquidité disponible ;
enregistrer les snapshots pour replay et historique.
3. Refaire le moteur d’exécution paper

Le paper trading doit simuler une exécution contre le vrai carnet Polymarket, pas contre un carnet inventé.

À modéliser :

market buy = limite agressive contre asks ;
market sell = limite agressive contre bids ;
limit order resting ;
FOK ;
FAK ;
GTC ;
GTD ;
post-only ;
partial fills ;
slippage réel ;
taille disponible par niveau ;
annulation ;
expiration ;
statut : open, partially filled, filled, cancelled, expired, rejected.
4. Refaire les frais

Ne pas garder le TAKER_FEE_RATE = 0.07 codé en dur. Il faut récupérer le fee rate Polymarket par token quand disponible.

À suivre :

fee estimate avant order ;
fee réel par fill simulé ;
PnL brut ;
PnL net ;
ROI ;
break-even ;
payout attendu.
5. Ajouter les marchés 1h

Aujourd’hui, le repo est typé seulement 5 | 15.

À faire :

type WindowMin = 5 | 15 | 60;

Mais ce n’est pas suffisant. Il faut surtout que la discovery trouve les vrais slugs Polymarket 1h, au lieu de générer des fenêtres locales.

6. Ajouter une vraie persistance

localStorage suffit pour une démo, pas pour un simulateur d’entraînement.

À prévoir :

IndexedDB minimum côté client ;
idéalement Supabase / SQLite local / backend ;
stockage des trades ;
stockage des books ;
stockage des résolutions ;
equity curve ;
export CSV ;
sessions d’entraînement ;
replay.