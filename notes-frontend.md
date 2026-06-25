# TO DO

On va vérifier / améliorer l'UI/UX de l'app pour que l'expérience soit le plus proche possible de celle de Polymarket pour ses marchés crypto Up/Down, avec une esthétique ergonomique, epurée et professionnelle.

Voici les vérifications et améliorations à effectuer:

La page d'un marché doit contenir :

- Header marché avec icône crypto.
- Titre clair: ex. "BTC Up or Down 5 m".
- Sous-titre avec date et intervalle exact : juin 23, 11:50-11:55 ET. D'ailleurs il faut pouvoir changer le fuseau horaire dans l'app pour utiliser l'heure locale de l'utilisateur (ex. heure de Paris).

- Bloc Prix à battre.
- Bloc Prix actuel avec indication de sa distance du prix à battre en vert ou rouge (ex. +21,16$).
- Timer de clôture avec minutes et secondes.

- Graphique principal occupant la majorité de la largeur. Switch d’affichage nécessaire en bas à droite car Polymarket utilise plusieurs modes de graphique :
    - probabilités de UP borné entre 0 et 100% (ligne);
    - prix du sous-jacent (ligne);
    - prix du sous-jacent en chandeliers japonais.
Ligne du target / prix à battre affiché en pointillés sur les graphiques de prix du sous-jacent. Label flottant "target" sur la courbe du prix, avec une fleche vers le bas si le l'affichage du prix est au dessus du target, et vers le haut si le l'affichage du prix est en dessous du target.
    - Afficher les positions sur les graphiques. Pour chaque position on doit voir le prix d'entrée, le PnL en pourcentage et en valeur monétaire. Le fond de la ligne du graphique sera coloré en fonction de la position (vert pour UP, rouge pour DOWN).
- Ticket de trading sticky à droite sur desktop.
- Liste des autres marchés crypto en sidebar.
- Carnet d’ordres déplibable sous le graphique.
- Navigation temporelle en bas : passé, marchés précédents/suivants, More.

Timer et urgence de marché:

Le composant Timer doit être placé dans le coin supérieur droit de la zone graphique, aligné avec le header du marché. Il doit transmettre l’urgence sans animation excessive : uniquement une légère variation visuelle dans les 30 dernières secondes.

Features:
- Affichage minutes et secondes. Labels MIN et SECS.
- Position visible dans le header du graphique.
- Timer mis en avant uniquement quand le marché est live (pour le différencier des marchés fermés ou à venir).

Ticket de trading — structure commune.

Features:
- Header compact avec icône crypto, titre, statut Up ou Down en fonction du côté du ticket (on achète UP ou DOWN).
- Tabs Acheter / Vendre.
- Type d’ordre à droite : Ordre Limité, Ordre Au Marché, 1-Tap.
- Sélecteur Up / Down.
- CTA principal "Négocier" (remplacer par un terme plus explicite comme "Acheter" ou "Vendre" en fonction du côté du ticket).
- États différents selon le type d’ordre.
- Prix affiché en cents.
- Calcul dynamique du total et du gain potentiel.

Ticket — ordre limit

Features:
- Champ Prix limite avec boutons - et +, permettant d'ajuster le prix limite par paliers de 1 centime.
- Prix en cents, exemple 10¢.
- Champ Positions avec boutons rapides en dessous: -100, -10, +10, +100.
- Il faudrait ajouter un champ qui permettrait d'entrer le motant en dollars que l'on veut dépenser. En fonction du montant le nombre de positions achetées ou vendues serait calculé automatiquement. L'inverse est aussi vrai: entrer le nombre de positions donne le montant en dollars.
- menu déroulant Expiration : Jamais / 1m / 5m / 1h / 12h / 24h / Fin de journée (minuit heure du fuseau horaire de l'utilisateur).
- Total: rappel du cout total de la transaction.
- Gain potentiel : gain en $ si la position est gagnante.
- CTA pour acheter / vendre.

Ticket — ordre au marché

Features:
- Type d’ordre : Ordre Au Marché.
- Sélecteur Up/Down.
- Champ Montant permettant d'entrer le montant de la position en dollars.
- Boutons rapides : +$1, +$5, +$10, +50$, +$100, +200$, +500$, +1000$.
- CTA Acheter / Vendre.

Ticket — 1-Tap buy

Features:
- Type d’ordre : 1-Tap.
- Sélecteur Up/Down.
- Section One-tap buy.
- Boutons prédéfinis : $5, $10, $25, $50, $100, $200, $500, $1000$.
- Chaque bouton affiche le gain potentiel : ex. win $5.


Navigation entre marchés

Une barre de navigation temporelle sous le graphique pour changer de marché rapidement.
À gauche un bouton déroulant "Passé" avec chevron. Ce bouton liste les marchés résolus dans l'ordre anti-chronologique.
À droite 3 boutons (raccourcis) pour naviguer rapidement vers les 4 derniers marchés résolus.

Ensuite, afficher des pills horaires : ex. 11:50, 11:55, 12:00, 12:05, bouton More pour ouvrir davantage d’intervalles. Le marché actif doit être facile à identifier visuellement. Un indicateur doit signaler si le marché est terminé / en résolution.
Un bouton "Live" qui soit un raccourcis pour aller vers le marché live.
Cette navigation doit permettre de passer très vite d’un marché expiré à un marché live ou à venir.

Features:
- Bouton déroulant Passé. Affiche la liste des marchés résolus dans l'ordre anti-chronologique avec une pastille colorée (verte ou rouge) + une flèche qui indique si le marché a été résolu UP ou DOWN.
- Boutons raccourcis vers les 4 derniers marchés résolus. Ces raccourcis doivent être accompagnés d'une flèche/couleur qui indique si le marché a été résolu UP ou DOWN.
- Pills horaires : ex. 11:50, 11:55, 12:00, 12:05. Le marché live doit être position 2/4 dans les pills (expiré, live, à venir1, à venir2).
- Quand le marché actif: pill mise en avant avec point rouge animé.
- Animation spécifique quand marché en cours de résolution.
- Bouton More déroulant avec les marchés à venir du jour.

Affichage des autres marchés crypto à droite, en dessous du ticket:

Permet de naviguer entre les marchés crypto Up/Down pour scanner rapidement les opportunités sans quitter le marché actuel. En haut, afficher des tabs de durée : 5 min, 15 min, etc. La durée active doit être mise en avant.
Sous les tabs, afficher une liste des marchés avec icône crypto à gauche, nom du marché au centre, et à droite la probabilité actuelle en grand, par exemple 98%, avec la direction Up ou Down en petit dessous.

Features:
- Tabs de durée : 5 min, 15 min, 1 heure.
- Liste des autres cryptos disponibles : ex. Ethereum, Solana, XRP, Dogecoin etc. avec icône de chaque crypto.
- Nom du marché (ex. "Solana Up or Down  - 5 min").
- Probabilité et direction actuelle (ex. 95% Up).
- Pastille animée indiquant que les marchés sont live.
Prompt designer

États de résolution du marché:
Il faut deux états post-expiration pour les marchés Up/Down.

- Premier état : détermination du gagnant en cours. Spinner dans la carte, titre "Hold on, determining winner...", puis le nom du marché et son intervalle. Ajouter un message secondaire expliquant que le marché est terminé et que la résolution finale apparaîtra automatiquement.
- Second état : résolu. Icône check, titre Outcome: Up ou Outcome: Down avec couleur verte ou rouge pour les mots up/down en fonction du résultat, puis le nom du marché et l’intervalle. Le design doit être sobre, rassurant et compatible avec un terminal de trading.

États live, upcoming, expired:
Chaque marché doit avoir un état clair:
- Upcoming : marché ouvert mais pas encore live.
- Live : countdown actif, prix mis à jour.
- Ended : marché terminé, résolution en cours.
- Resolved : outcome affiché.
- Past : accessible dans la navigation.

Micro-interactions:

Définir des micro-interactions très sobres pour l’interface de trading. Les boutons doivent avoir un hover léger, les inputs un focus visible, et les tabs une transition rapide. Pas de flashs agressifs.
Toutes les animations doivent rester sous 150 ms, sauf le spinner de résolution. Priorité absolue à la lisibilité et aux performances. L’interface doit être dynamique mais non bruyante.

Design:
Penser au responsive pour l'ensemble du projet, ainsi qu'à l'alignement / positionnement des éléments, aux modes jour/nuit, etc. Pour une UI/UX professionnelle.
Utiliser des design tokens afin de garantir la cohérence du design sur l'ensemble du projet.