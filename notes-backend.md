# TO DO

On va vérifier / améliorer le fonctionnement de notre app afin qu'il soit le plus proche possible de celui de Polymarket.

Tout d'abord j'aimerai remplacer le storage actuel trop limitant par un vrai storage Sqlite. Ainsi il nous sera possible de stocker plus de données, d'avoir plus de flexibilité, etc.

Ensuite voici les vérifications / améliorations à effectuer:

1. Le runtime démarre encore Binance

Le hook global useSimEngine() est appelé dans le root layout. Or ce hook importe encore priceFeed depuis ../feed/binance-ws et appelle priceFeed.start(). Le fichier binance-ws.ts est toujours un feed Binance REST polling vers /api/prices.

C’est incompatible avec l’objectif “vrais marchés Polymarket”. Même si le store ne semble plus vraiment utiliser les prix Binance pour construire les marchés, ce feed ne doit plus être lancé dans le runtime principal.

Correction attendue :

// use-sim-engine.ts
useEffect(() => {
  useSimStore.getState().init();

  const tickId = window.setInterval(() => {
    useSimStore.getState().tick();
    polymarketClobSocket.syncSubscriptions();
  }, 500);

  polymarketClobSocket.start();

  return () => {
    window.clearInterval(tickId);
    polymarketClobSocket.stop();
  };
}, []);

Priorité : P0.

2. Le WebSocket CLOB existe, mais ne semble pas branché

Le module polymarket-clob-ws.ts existe et se connecte bien à wss://ws-subscriptions-clob.polymarket.com/ws/market. Il gère book, price_change, last_trade_price, market_resolved et new_market. C’est cohérent avec la documentation Polymarket, qui indique que le market channel fournit snapshots, price changes, trades et events par asset_ids.

Mais le hook réellement appelé par l’app (useSimEngine) ne démarre pas ce module ; il démarre Binance. Donc en pratique, l’app risque de rester sur un bootstrap REST ponctuel des carnets, sans stream CLOB temps réel.

Impact :

carnets vite périmés ;
fills paper sur liquidité stale ;
pas de market_resolved si le WS n’est pas actif ;
latence et spread non réalistes.

Priorité : P0.

3. Les types d’ordres ne collent pas encore parfaitement à Polymarket

L’app définit séparément :

OrderType = "MARKET" | "LIMIT" | "FOK" | "FAK"
TimeInForce = "GTC" | "GTD"

Polymarket, lui, documente les types GTC, GTD, FOK, FAK. Les “market orders” sont des limites marketables, et FOK/FAK sont des types d’ordre de marché immédiats ; GTC/GTD sont des ordres limites qui peuvent reposer.

Le ticket d’ordre expose à la fois Market / Limit / FOK / FAK et GTC / GTD, ce qui permet potentiellement des combinaisons absurdes du type FAK + GTD ou MARKET + GTC.

Correction attendue :

Remplacer le modèle mental par :

type PolymarketOrderType = "GTC" | "GTD" | "FOK" | "FAK";

Puis dans l’UI :

GTC = Limit resting ;
GTD = Limit avec expiration ;
FOK = Immediate-or-cancel total ;
FAK = Immediate-or-cancel partiel ;
“Market” = preset UI qui crée un FAK avec prix agressif ou une limite marketable selon le comportement voulu.

Priorité : P1.

4. FAK et MARKET partiellement remplis restent probablement ouverts

Dans statusAfterFill, un ordre MARKET ou FAK partiellement rempli devient PARTIALLY_FILLED. Or isOpenStatus() considère PARTIALLY_FILLED comme ouvert.

Problème : un FAK doit remplir immédiatement ce qui est disponible puis annuler le reliquat. Polymarket documente explicitement que FAK “fills as many shares as available immediately, then cancels any unfilled remainder”.

Impact :

des reliquats FAK peuvent rester ouverts dans le portfolio ;
des réserves peuvent rester bloquées ;
le comportement paper ne correspond pas à Polymarket.

Correction attendue :

Pour FAK :

if (filled > 0 && remaining > 0) return "FILLED"; 
// ou statut interne plus précis : "PARTIALLY_FILLED_CANCELLED"

Mais ne jamais le garder ouvert.

Pour MARKET, même logique : si c’est une abstraction de market order, le reliquat doit être annulé, pas laissé ouvert.

Priorité : P1.

5. Tick size non respecté

Polymarket indique que chaque marché a un tick size et que le prix d’un ordre doit respecter cet incrément, sinon l’ordre est rejeté. L’app stocke tickSize dans le type Market. Le normaliseur récupère orderPriceMinTickSize avec fallback 0.01.

Mais dans le placeOrder, le prix est seulement clampé entre 0.001 et 0.999. Je ne vois pas de validation stricte du type :

price % tickSize === 0

ou d’arrondi contrôlé au tick.

Impact :

l’utilisateur peut s’entraîner avec des prix que Polymarket rejetterait ;
mauvaise simulation du carnet ;
PnL et fill probability faussés.

Priorité : P1.

6. La résolution est encore ambiguë

Le WebSocket module gère market_resolved, ce qui est bon. Polymarket documente bien un event market_resolved avec winning_asset_id et winning_outcome.

Mais le normaliseur marque un marché resolved si now >= endDate, ou si closed, archived, active=false. Le store appelle aussi updateMarketStatus() à chaque tick.

Ce comportement est dangereux : la fin de fenêtre n’est pas forcément équivalente à une résolution officielle confirmée. Pour un simulateur d’entraînement, il faut distinguer :

ended / awaiting_resolution;
resolved_official;
redeemable.

Aujourd’hui, le marché peut apparaître résolu dès endDate, alors que resolvedOutcome n’est pas forcément connu. La logique markMarketResolved() règle ensuite le gagnant quand un event arrive, mais si l’event est manqué, le marché peut rester dans un état résolu sans résultat exploitable.

Correction attendue :

type MarketState =
  | "UPCOMING"
  | "LIVE"
  | "CLOSING"
  | "ENDED"
  | "AWAITING_RESOLUTION"
  | "RESOLVED";

Le rachat paper ne doit être possible qu’après market_resolved ou confirmation Gamma/CLOB officielle.

Priorité : P1.

7. Discovery Gamma : bonne base, mais pas encore assez robuste pour settlement

La route /api/polymarket/markets interroge Gamma avec active=true, closed=false, archived=false, et un end_date_min d’environ une heure dans le passé. C’est logique pour afficher les marchés actifs/upcoming, mais insuffisant pour garantir les résolutions si le WebSocket est raté ou si l’utilisateur revient après coup.

Manque :

endpoint séparé /api/polymarket/resolved?conditionIds=...;
refresh post-expiration pour les marchés détenus en portefeuille ;
vérification explicite du gagnant via winning_outcome, closed, resolvedBy, ou données de résolution disponibles ;
conservation des marchés récemment terminés même s’ils sortent du scan actif.

Priorité : P1.

8. Le book paper modifie le book CLOB local

Le matching consomme les niveaux du book en retirant les tailles remplies. Le store remplace ensuite le book par res.newBook.

C’est compréhensible pour éviter qu’un utilisateur remplisse dix fois la même liquidité stale. Mais attention : comme l’ordre est paper, il ne modifie pas réellement le CLOB Polymarket. Le prochain update WebSocket peut donc contredire le “book paper consommé”.

Meilleure architecture :

realBook = carnet Polymarket strictement reçu ;
paperShadowBook = carnet ajusté par les fills paper locaux ;
matching contre paperShadowBook;
affichage du vrai CLOB séparé du shadow book ;
resynchronisation contrôlée quand un vrai event CLOB arrive.

Priorité : P2.

9. Réserves cash incomplètes

reservedForOrder() réserve seulement :

remainingSize * limitPrice

pour les ordres BUY ouverts.

Il ne semble pas réserver les frais potentiels. Or le moteur facture bien des frais au moment des fills. Polymarket expose les frais via fee-rate, avec base_fee en basis points.

Impact :

un utilisateur peut avoir assez de cash réservé hors frais, mais pas assez avec frais ;
risque d’équity/cash négatif ou d’acceptation d’ordres que le simulateur devrait refuser.

Priorité : P2.

10. best_bid_ask et tick_size_change ne sont pas vraiment exploités

La documentation Polymarket liste notamment best_bid_ask et tick_size_change. Le module WebSocket typé dans le repo inclut best_bid_ask, mais ne semble pas appliquer ses champs ; il ignore aussi tick_size_change.

Impact :

le top-of-book peut être moins précis ;
le tick size peut devenir obsolète quand Polymarket le change près des bornes de prix.

Priorité : P2.