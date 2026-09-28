# Guide utilisateur — QR Tracker

QR Tracker est un outil gratuit du labo pour créer des QR codes et suivre leur
utilisation, **sans compte et sans données personnelles**.

👉 <https://titouanlegourrierec.github.io/qr-tracker/>

## Créer un QR code

1. Ouvrez la page **Créer**.
2. Collez l'adresse de destination (votre page web, un formulaire, un article…).
3. Donnez-lui un nom si vous voulez vous y retrouver (« Affiche couloir B »).
4. Cliquez sur **Créer le QR code** (une vérification anti-robot se fait toute seule).

Vous obtenez :

- le **QR code**, à télécharger en **PNG** (haute résolution, pour l'impression) ou en
  **SVG** (vectoriel, pour les graphistes) ;
- le **lien court** derrière le QR code ;
- votre **clé secrète** — ⚠️ elle n'est affichée qu'une seule fois. Copiez-la dans un
  endroit sûr (gestionnaire de mots de passe, notes…). Sans elle, impossible de consulter
  les statistiques ou de modifier le lien ;
- un **lien privé vers les statistiques** à mettre en favori : il contient la clé après
  le `#`, qui n'est jamais transmise au serveur.

Le QR code est aussi ajouté à **Mes QR codes** — mais uniquement dans le navigateur où
vous l'avez créé. Utilisez **Exporter (JSON)** pour faire une sauvegarde ou passer d'un
ordinateur à un autre.

## Consulter les statistiques

Trois façons :

- ouvrir votre **lien privé** mis en favori ;
- passer par **Mes QR codes** → _Statistiques_ ;
- ou **Statistiques** → saisir le code (7 caractères) et la clé secrète.

Vous y trouvez : le nombre de scans, les visiteurs uniques (estimation par jour), les
scans par jour et par heure, la répartition par heure et jour de la semaine, les pays,
villes, appareils, systèmes, navigateurs, langues et opérateurs. Les robots (aperçus de
liens WhatsApp/Slack/moteurs de recherche…) sont exclus par défaut — une case à cocher
permet de les inclure. Le bouton **Exporter les scans (CSV)** télécharge le détail
anonyme pour Excel/R/Python.

## Modifier ou supprimer

Sur la page de statistiques, en bas :

- **changer la destination** sans réimprimer le QR code (le même QR code pointera vers la
  nouvelle adresse) ;
- **désactiver** temporairement le lien (les scans affichent « lien désactivé ») puis le
  réactiver ;
- **supprimer définitivement** le lien et toutes ses statistiques (irréversible — le QR
  code imprimé cessera de fonctionner).

## Bonnes pratiques d'impression

- Téléchargez le **PNG** (1024 px) ou le **SVG** pour l'impression.
- Gardez une zone blanche autour du QR code et testez-le avec votre téléphone avant de
  lancer l'impression.

## Confidentialité en bref

Aucune adresse IP ni identifiant permanent n'est conservé ; les données de scan sont
anonymes et supprimées après 12 mois. Détails : page **Confidentialité** du site.

## En cas de problème

Ouvrez un ticket : <https://github.com/titouanlegourrierec/qr-tracker/issues>
