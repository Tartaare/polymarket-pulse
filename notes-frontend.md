# TO DO

Ici Notre mission est de faire en sorte que l'UI de notre app se rapproche de celle de Polymarket, pas en terme de couleurs etc. mais plutot en terme de structure et composants.
Feature concernée: les tickets de trading limit, market et one tap.
Je t'ai joint des screens de Polymarket ici: 

Corrections à effectuer:

- Le titre de marché est trop compact dans notre app. Notre ticket affiche "BTC Up/Down" alors que Polymarket contextualise davantage :
    - icône crypto à gauche
    - à droite de l'icone sur deux lignes: titre ex. "BTC vers le haut ou vers le bas 5 min" et en dessous : la direction actuellement sélectionnée en couleur (ex. Up).

- Boutons Up/Down cassés visuellement : dans l’app, Up81¢Down20¢ se chevauche et ne sont pas des boutons. Polymarket affiche deux boutons de sélection outcome Up --¢ et Down --¢. Couleurs: actif Up vert, actif Down rouge, inactif. Ils restent visibles dans les trois modes: limit, market, one-tap.

- Refaire le champ prix limite : Polymarket affiche le prix limite comme une ligne avec label à gauche et contrôle compact à droite : Prix limite - 1.2¢ + .
Notre app affiche:
label Prix limite puis une valeur en dessous -50¢+, très serrée qui n'est même pas un champ de saisie avec des boutons + - de chaque cotés.
On veut avoir une ligne de prix limite avec label et champ de saisie et boutons + - pour ajouter ou retirer des centimes (0.10¢ de step).

- Champ Positions pas fidèle:
Polymarket affiche Positions sur 3 lignes:
    - Ligne 1: label Positions à gauche et input numérique à droite centré verticallement sur Positions. Pas de boutons d'incrémentation dans ce champ.
    - Ligne 2: en dessous du champ numerique, les raccourcis quantité -100, -10, +10, +100
    - Ligne 3: quand l'utilisateur a entré une quantité, on affiche en petit (en vert ou rouge selon Up/Down) la quantité réellement exécutable en fonction du carnet d'ordres (ex. si la quantité de positions est de 5,300, on affiche "5,300 correspondant"). Au survol tooltip qui explique: "5,300 parts de cet ordre seront executées directement". L'utilisateur peut ainsi savoir quelle quantité de sa position sera exécutée.

- Champ Montant:
Notre champ Montant ne doit occuper qu'une ligne. Label aligné à gauche, champ numérique aligné à droite sur la ligne. Pas de boutons d'incrémentation dans ce champ.

- Champ Expiration:
Notre champ Expiration ne doit occuper qu'une ligne. Label aligné à gauche, Bouton déroulant aligné à droite sur la meme ligne. Aussi notre bouton est trop gros, celui de Polymarket est plus petit.

- Bouton CTA Acheter/Vendre Up/Down:
Notre bouton est trop "simple", celui de Polymarket a comme une animation "button pressed" au hover.

Pour t'aider voici une page polymarket:










Écarts identifiés

1. HEADER — Structure Prix à battre / Prix actuel / Distance
Polymarket (screenshots 210549, 210636) :

Layout : Prix à battre | Prix actuel | ▼ $96 | Timer
Le "Prix à battre" est affiché en grande taille (≈ 24px, gras, blanc)
Le "Prix actuel" est affiché en grande taille avec couleur rouge/verte selon distance, label "Prix actuel" au-dessus
La distance (ex. ▼ $96) est un badge compact avec flèche + montant, coloré vert/rouge
Le timer est positionné dans le même bandeau header, aligné à droite
Notre implémentation :

❌ On affiche UP / DOWN en cents et Liquidité au lieu du vrai prix du sous-jacent
❌ Le timer est dans la zone graphique (market-chart-zone__timer) au lieu du header
❌ Pas de "Prix actuel" du sous-jacent dans le header (il est caché dans la barre info du graphique)
IMPORTANT

Correction : Refondre le bandeau header pour afficher "Prix à battre" (target), "Prix actuel" (sous-jacent en direct), distance avec badge ▲/▼ coloré, et déplacer le timer dans le header à droite.

2. HEADER — Bouton "Aller au marché en direct"
Polymarket (screenshot 210538 — marché expiré) :

Quand on consulte un marché passé, un bouton ● Aller au marché en direct apparaît en haut à droite du header, à la place du timer
Notre implémentation :

❌ Ce bouton n'existe pas dans le header pour les marchés expirés/résolus
IMPORTANT

Correction : Ajouter un lien "Aller au marché en direct" avec dot rouge animé dans le header quand le marché consulté n'est pas le marché live.

3. HEADER — "Prix final" au lieu de "Prix actuel" pour marchés résolus
Polymarket (screenshot 210538) :

Pour un marché terminé : le label change de "Prix actuel" à "Prix final" avec un badge ▲ $69.44 vert
Notre implémentation :

❌ Pas de distinction prix actuel vs prix final selon l'état du marché
4. TICKET D'ORDRE — Header avec icône crypto dans un cercle coloré
Polymarket (screenshots 175414, 175420, 175440) :

Header du ticket : cercle BTC orange avec symbole ₿ à gauche, texte "BTC vers le haut ou vers le bas 5 m", puis Up ou Down en vert/rouge dessous
Le cercle icône est identique au header du marché
Notre implémentation :

⚠️ Le header affiche juste le symbole en texte (₿), pas dans un cercle coloré
✅ Le titre et le statut Up/Down sont présents
Correction : Ajouter le cercle coloré autour de l'icône dans le header du ticket (réutiliser le composant icône du header marché).

5. TICKET D'ORDRE — Tabs Acheter/Vendre positionnement
Polymarket (screenshots) :

"Acheter / Vendre" est affiché en texte simple avec underline sur l'onglet actif, pas dans un groupe de boutons avec fond
Le sélecteur de type d'ordre est en haut à droite du même bandeau, pas sur une ligne séparée : Acheter  Vendre       Ordre Limité ∨
Notre implémentation :

❌ Les tabs "Acheter/Vendre" sont dans un groupe bouton gris avec fond surface-2
❌ Le sélecteur de type est sur une 3e ligne séparée en grille, au lieu d'être aligné à droite des tabs
IMPORTANT

Correction : Restructurer le layout du header du ticket : Acheter/Vendre en tabs texte avec underline à gauche, type d'ordre en dropdown aligné à droite sur la même ligne.

6. TICKET D'ORDRE — Boutons UP/DOWN
Polymarket :

Bouton UP : fond vert avec prix en blanc (ex. Up 14¢)
Bouton DOWN : fond surface-2 (gris foncé) avec prix en blanc (ex. Down 87¢)
Le bouton actif a un fond vert/rouge, l'inactif est neutre gris
Notre implémentation :

⚠️ Les boutons existent avec les bonnes couleurs actives, mais vérifier le contraste et que l'inactif est bien gris neutre (pas de bordure colorée)
7. TICKET D'ORDRE — Champ "Positions" layout Polymarket
Polymarket (screenshot 175440) :

Le label "Positions" est à gauche, l'input numérique est à droite (alignement en ligne)
Les boutons rapides -100 -10 +10 +100 sont centrés sous l'input
L'input a un fond plus sombre avec bordure subtile
Notre implémentation :

❌ Le layout est en colonne (label au-dessus, input en dessous, full-width)
Le layout Polymarket est en ligne : label gauche, input droite
Correction : Passer les champs "Prix limite" et "Positions" en layout ligne (flex-row, justify-between).

8. TICKET D'ORDRE — CTA "Négocier" en bleu
Polymarket :

Le CTA est un bouton bleu (≈ #3b82f6 / blue-500) avec texte "Négocier" en blanc
Sur marché UP : vert ; Sur marché DOWN : rouge — non, dans les screenshots c'est bleu uniforme
Notre implémentation :

⚠️ Le CTA utilise --color-primary (orange/jaune brand). Les screenshots montrent un bleu distinctif.
Le label est bien "Acheter UP / Vendre DOWN" (ce qui est mieux que "Négocier")
Correction : Changer la couleur du CTA du ticket en bleu (#3b82f6) pour correspondre à Polymarket. Conserver notre label plus explicite "Acheter UP / Vendre DOWN".

9. TICKET D'ORDRE — "Pour gagner" avec icône billet
Polymarket (screenshot 175440) :

La ligne "Pour gagner" affiche une petite icône de billet/argent 💵 avant le montant
Le montant est en vert
Notre implémentation :

❌ Pas d'icône billet
❌ Le label est "Gain potentiel" au lieu de "Pour gagner"
Correction : Renommer "Gain potentiel" → "Pour gagner", ajouter l'icône billet, colorer le montant en vert.

10. TICKET D'ORDRE — Mention légale en bas
Polymarket :

Sous le CTA : "En négociant, vous acceptez les Conditions d'utilisation." avec lien
Notre implémentation :

❌ Absent
Correction : Ajouter la mention légale sous le CTA (texte petit, muted).

11. CARNET D'ORDRES — Structure Polymarket
Polymarket (screenshot 210636) :

Le carnet d'ordres a un header avec tabs "Trader Up / Trader Down", un badge "Remise Maker" et "Récompenses"
Les colonnes sont : TRADER UP / PRIX / PARTS / TOTAL
Un label "Ventes" rouge sépare asks des bids, un label "Achats" vert sépare bids
Dernière ligne entre les deux : "Dernier: 15¢ · Écart: 1¢"
Volume affiché dans le header : "$1.7K Vol."
Notre implémentation :

⚠️ Le carnet existe mais avec une structure différente (deux panneaux côte à côte UP/DOWN)
❌ Pas de labels "Ventes"/"Achats"
❌ Pas d'info "Dernier" et "Écart" entre bids/asks
❌ Pas de volume dans le header
❌ Pas de tabs "Trader Up / Trader Down"
WARNING

Correction majeure : Refondre le carnet d'ordres pour adopter la structure Polymarket : tabs Up/Down, colonnes PRIX/PARTS/TOTAL, labels Ventes/Achats avec séparateur mid/spread, volume dans le header.

12. NAVIGATION — Raccourcis résolus avec pastilles colorées rondes
Polymarket (screenshots 210636, 170426) :

Les raccourcis résolus sont des petits cercles colorés (vert ↑ ou rouge ↓) côte à côte, sans texte
Pas 4 boutons avec texte de temps, mais des dots verts/rouges compacts
Notre implémentation :

⚠️ On affiche des boutons avec flèche + heure. Plus verbeux que Polymarket qui utilise juste des dots.
Correction : Remplacer les shortcuts textuels par des pastilles circulaires colorées (vert/rouge) comme sur Polymarket.

13. NAVIGATION — Dropdown "Passé" & "More"
Polymarket (screenshot 170426) :

Le dropdown "Passé" affiche deux colonnes :
Gauche : marchés résolus anti-chronologiques avec dot coloré et heure
Droite : marchés "More" (futurs) avec heure et date
Le dropdown est large (≈ 400px) sur deux colonnes
Notre implémentation :

❌ Le dropdown "Passé" est une seule colonne étroite (14rem)
❌ Le "More" est un dropdown séparé
Correction : Élargir le dropdown Passé et le More, ajouter "Ended: juin 25" comme section title, et afficher les items "More" à droite dans le même dropdown ou dans un dropdown plus structuré.

14. NAVIGATION — Pill "Ended" avant les pills horaires
Polymarket (screenshot 210538 — marché passé) :

Avant les pills horaires, un pill gris Ended: juin 25 apparaît
Notre implémentation :

❌ Pas de pill contextuelle "Ended"
15. GRAPHIQUE — Sélecteur de mode en icônes
Polymarket (screenshots 210636, 210549) :

Le sélecteur de mode du graphique est en bas à droite sous le graphique
Il utilise 3 icônes (📈 ligne, ₿ crypto, 🕯️ chandelier) au lieu de texte
Les icônes sont dans un groupe compact avec fond sombre
Notre implémentation :

❌ Utilise des boutons texte ("Probabilité", "Prix (Ligne)", "Chandeliers") au lieu d'icônes
✅ Positionné en bas du graphique (aligné à droite)
Correction : Remplacer les labels texte par des icônes SVG compactes pour les modes du graphique.

16. SIDEBAR — Tab "1 jour" supplémentaire
Polymarket (screenshot 210636) :

La sidebar a 4 tabs : 5 min | 15 min | 1 heure | 1 jour
Notre implémentation :

❌ Seulement 3 tabs : 5 min | 15 min | 1 heure
Correction : Ajouter le tab "1 jour" si des marchés 24h existent dans la data.

Éléments conformes ✅
Élément	Statut
Icône crypto ronde dans le header	✅ Conforme
Titre marché "BTC Up or Down Xm"	✅ Conforme
Sous-titre avec date et intervalle	✅ Conforme
Graphique TradingView 3 modes	✅ Conforme
Ligne cible en pointillés	✅ Conforme
Label flottant "target" avec flèche	✅ Conforme
Timer minutes:secondes avec MIN/SECS	✅ Conforme
Timer urgence 30s avec pulsation	✅ Conforme
Navigation pills horaires	✅ Conforme
Point rouge animé sur pill live	✅ Conforme
Boutons UP/DOWN avec prix en cents	✅ Conforme
Stepper ±1¢ pour prix limite	✅ Conforme
Boutons rapides -100/-10/+10/+100	✅ Conforme
Mode marché avec presets $	✅ Conforme
Mode 1-Tap avec gain potentiel	✅ Conforme
Sidebar crypto avec tabs durée	✅ Conforme
États résolution (spinner + resolved)	✅ Conforme
Dual theme jour/nuit	✅ Conforme
Plan d'implémentation — Priorité par impact UX
Phase 1 — Header marché (Impact critique)
[MODIFY] 
market.$marketId.tsx
Refondre le bandeau market-header__stats :
Afficher "Prix à battre" avec le prix target extrait de la question
Afficher "Prix actuel" du sous-jacent (via RTDS) en grand, coloré selon distance
Badge distance compact ▲/▼ $XX.XX
Déplacer le timer dans le header (retirer market-chart-zone__timer)
Ajouter le bouton "Aller au marché en direct" pour marchés non-live
Changer label "Prix actuel" → "Prix final" pour marchés résolus
[MODIFY] 
styles.css
Nouveaux styles pour le header restructuré
Styles pour le badge distance
Styles pour le bouton "Aller au marché en direct"
Phase 2 — Ticket d'ordre (Impact élevé)
[MODIFY] 
OrderTicket.tsx
Restructurer le header du ticket : icône dans cercle coloré
Fusionner la ligne Acheter/Vendre + Type d'ordre sur une seule ligne (tabs underline + dropdown droit)
Passer les champs Prix limite / Positions en layout ligne
Renommer "Gain potentiel" → "Pour gagner ℹ" avec icône billet et montant vert
Ajouter mention légale sous le CTA
Changer la couleur du CTA en bleu #3b82f6
[MODIFY] 
styles.css
Styles pour tabs underline, layout ligne des champs, CTA bleu, mention légale
Phase 3 — Carnet d'ordres (Impact moyen)
[MODIFY] 
OrderBookTable.tsx
Ajouter tabs "Trader Up / Trader Down"
Restructurer en une seule colonne avec labels "Ventes" (rouge) / "Achats" (vert)
Ligne centrale "Dernier: X¢ · Écart: X¢"
Volume dans le header du carnet
[MODIFY] 
market.$marketId.tsx
Refondre la section carnet (retirer la grille 2 panneaux, passer en single-panel avec tabs)
Phase 4 — Navigation & graphique (Impact modéré)
[MODIFY] 
MarketNavigation.tsx
Remplacer les shortcuts textuels par des pastilles circulaires colorées
Élargir le dropdown "Passé"
Ajouter pill contextuelle "Ended: date"
[MODIFY] 
MarketChart.tsx
Remplacer les labels texte du sélecteur de mode par des icônes SVG
[MODIFY] 
CryptoSidebar.tsx
Ajouter tab "1 jour" si applicable
[MODIFY] 
styles.css
Styles pour pastilles de navigation, icônes de mode, etc.
Open Questions
IMPORTANT

Couleur du CTA : Les screenshots montrent un CTA bleu (#3b82f6). Souhaites-tu adopter ce bleu ou conserver notre couleur brand (orange/jaune) ?
IMPORTANT

2. Carnet d'ordres : La refonte du carnet (Phase 3) est le changement le plus lourd. Veux-tu le prioriser maintenant ou le reporter à un sprint suivant ?

IMPORTANT

3. Périmètre : Certains écarts sont purement cosmétiques (pastilles vs boutons texte dans la nav). Veux-tu tout corriger dans ce sprint ou prioriser seulement les phases 1 et 2 (header + ticket) ?




# DONE

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
Update @design_language.md si nécessaire, on veut avoir des tokens design à jour.