# Budget hebdo (PWA)

Suivi des dépenses et budget semaine par semaine. S'installe sur l'écran d'accueil, fonctionne hors ligne, et synchronise vos données entre appareils dans **votre propre dépôt GitHub privé**, avec un token. Aucun autre serveur.

## Mise en route en 3 étapes

### 1. Héberger l'appli (HTTPS obligatoire pour une PWA)
L'appli ne contient aucun secret : elle peut être publique.
- Créez un dépôt GitHub (ex. `budget-app`), envoyez-y le contenu de ce dossier (`index.html`, `app.js`, `style.css`, `sw.js`, `manifest.webmanifest`, `icons/`).
- Dépôt → Settings → Pages → Source : « Deploy from a branch », branche `main`, dossier `/ (root)`.
- Votre adresse sera `https://VOTRE-PSEUDO.github.io/budget-app/`.
- Alternative : glisser le dossier sur Netlify Drop ou Cloudflare Pages.

### 2. Préparer le stockage des données
- Créez un **second dépôt, privé**, vide (ex. `budget-data`). Ne le rendez jamais public : il contiendra vos dépenses.
- GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*.
  - Repository access : **Only select repositories** → `budget-data` uniquement.
  - Permissions → Repository → **Contents : Read and write**.
  - Choisissez une durée (max. 1 an) et notez la date de renouvellement.

### 3. Connecter chaque appareil
Ouvrez l'appli, collez `pseudo/budget-data` et le token, puis « Tester et connecter ». Refaites-le sur chaque appareil.
- Android / Chrome : menu ⋮ → « Installer l'application ».
- iPhone / Safari : Partager → « Sur l'écran d'accueil ».

## Mois, revenus, charges fixes et épargne de secours
- **Mois de paie :** le mois va du jour de votre choix (5 par défaut, réglable de 1 à 28) à la veille du même jour du mois suivant. Les semaines qui chevauchent deux mois utilisent le budget journalier de chaque mois.
- **Revenus variables :** onglet Mois, ajoutez chaque revenu reçu (salaire, prime, aide…) avec sa date. Le total du mois remplace les « revenus habituels » du Réglages tant qu'aucun revenu n'est saisi. Un bouton recopie les revenus du mois précédent.
- **Affichage lisible (direction D) :** police Atkinson Hyperlegible, contrastes forts, états dits en mots et en icônes (« Dans le budget », « Attention », « Dépassé »), demi-jauge et cartes « Par jour » et « Rythme » sur l'écran Semaine, icônes par catégorie, pavé numérique et catégorie suggérée à la saisie, glissement d'une ligne pour dupliquer ou supprimer, courbe cumulée et calendrier dans l'onglet Mois, recherche avec filtres (loupe en haut). Réglages > Affichage : thème, taille du texte, densité, animations (propres à chaque appareil).
- **Ticket lu par une IA :** dans « Ticket de caisse », « Coller un ticket » affiche une consigne à copier pour votre assistant IA (avec la photo du ticket). Collez sa réponse (une ligne par article : `nom ; prix ; E ou S`, puis `Total ; montant`) : l'application remplit les articles et le montant, vous vérifiez et enregistrez.
- **Ticket de caisse :** en saisissant une dépense (courses par exemple), ouvrez « Ticket de caisse », listez les articles et marquez ceux qui sont superflus. Le total des articles ne peut pas dépasser la dépense ; le reste est « non détaillé ». L'onglet Mois affiche la part d'essentiel et de superflu et les principaux achats superflus.
- **Corriger le revenu du mois :** dans le Bilan du mois, bouton « Modifier » : montant réel pour ce mois uniquement, ou nouveau revenu habituel. **Décalage de paie :** sur chaque revenu, « Compter pour le mois » (selon la date / mois précédent / mois suivant) pour une paie reçue avant le 5 ou en retard.
- **Charges fixes datées :** la date est obligatoire (jour du mois, jour de la semaine, ou mois et jour pour les charges annuelles et trimestrielles). L'onglet Fixes affiche le calendrier des prélèvements du mois et le prochain prélèvement de chaque charge. Par défaut, les charges non mensuelles sont lissées sur 12 mois dans le budget.
- **Épargne de secours :** le dépassement d'un mois (dépenses moins budget) est calculé automatiquement. Il est retenu sur le budget du mois suivant (option désactivable), et l'onglet Épargne suit le « reste à remettre » après les remises que vous notez.

## Pilotage et confort
- **Au rythme actuel :** après 5 jours dans le mois, l'onglet Mois projette la fin de mois (dépense moyenne par jour, dépassement prévu, date d'épuisement du budget, plafond par jour pour tenir).
- **Prévision du compte courant :** saisissez le solde et sa date. L'appli applique les revenus datés à venir, les charges fixes à leur date, le virement d'épargne (jour réglable) et les dépenses au rythme actuel. Elle affiche le point bas du mois et alerte sous un seuil réglable.
- **Enveloppes :** Réglages > Enveloppes : un plafond hebdomadaire par catégorie. Le total ne peut jamais dépasser le budget de la semaine (la saisie est bridée au maximum possible). Boutons « Répartir selon mes dépenses » (8 dernières semaines), « Parts égales » et « Vider ». Si le budget baisse et que le total dépasse, une alerte propose « Réduire proportionnellement ». L'écran Semaine montre ce qu'il reste dans chaque enveloppe, l'onglet Mois le bilan par enveloppe, le hors-enveloppe et le non réparti.
- **Conseils :** si une catégorie dépasse son budget 2 mois sur les 3 derniers, l'appli propose un budget hebdo réaliste (bouton Appliquer).
- **Provisions :** une somme mensuelle retirée du budget pour les dépenses irrégulières. En saisissant la dépense, choisissez la provision : elle ne pèse plus sur le budget.
- **Matelas de sécurité :** solde de l'épargne de secours, objectif en mois de dépenses et couverture actuelle.
- **Saisie rapide :** favoris en un toucher (case « Ajouter aux favoris » à la saisie), autocomplétion des notes avec catégorie et montant habituels, bouton Annuler après chaque ajout ou suppression, glisser une dépense vers la gauche pour la supprimer.
- **Raccourci :** un appui long sur l'icône (Android) propose « Ajouter une dépense ». Sur iPhone, ajoutez l'adresse `…/?add=1` en favori ou sur l'écran d'accueil.
- **Verrouillage par code (4 à 8 chiffres) :** demandé à l'ouverture et après le délai choisi. Il chiffre le token GitHub (AES-GCM, clé dérivée du code). Un code oublié se réinitialise depuis l'écran de verrouillage, ce qui déconnecte GitHub : reconnectez-vous avec le token. Limite : cela protège contre un accès rapide au téléphone, pas contre quelqu'un qui maîtrise le navigateur, car les données du budget restent lisibles dans le stockage de l'appareil.

## Comment la synchro fonctionne
- Toutes les données tiennent dans un fichier `budget-hebdo.json` du dépôt de données.
- L'appli garde une copie locale : elle marche sans réseau, et envoie les changements dès que la connexion revient (au lancement, au retour sur l'appli, 1,5 s après chaque saisie, puis toutes les 90 s).
- Si deux appareils modifient en même temps, la fusion garde, élément par élément, la version la plus récente. Une suppression est conservée 180 jours pour se propager aux autres appareils.
- Chaque synchronisation crée un commit dans le dépôt de données : c'est aussi un historique de sauvegarde.

## Limites à connaître
- **Le token est stocké dans le navigateur** de l'appareil (localStorage). Un token limité à un seul dépôt privé et à la permission Contents limite les dégâts en cas de vol du téléphone. Révoquez-le sur GitHub si besoin, puis reconnectez-vous.
- Les données ne sont **pas chiffrées** dans le dépôt : gardez-le privé.
- Le fichier est lu en une fois : prévoyez de l'ordre de 8 000 dépenses avant d'approcher 1 Mo (plusieurs années d'usage). L'appli sait encore le lire au-delà, mais c'est la limite de confort.
- **Pas de notification programmée** : une PWA sans serveur ne peut pas réveiller le téléphone. Un message de rappel s'affiche dans l'appli après 18 h si rien n'a été saisi.
- Sauvegarde : Réglages → Exporter (JSON). L'import accepte aussi l'export de la version « page Claude » de l'appli.

## Tester en local
```bash
python3 -m http.server 8080
```
Puis http://localhost:8080 (`localhost` est accepté comme contexte sécurisé).

## Mettre à jour l'appli
Après modification des fichiers, changez `VERSION` dans `sw.js` (ex. `budget-v4`) pour forcer le rafraîchissement du cache hors ligne.
