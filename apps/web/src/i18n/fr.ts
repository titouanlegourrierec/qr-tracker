/**
 * All user-facing strings, centralized so another language can be added later.
 * Keys are grouped by page/feature. Developer-facing text stays in English.
 */
export const fr = {
  app: {
    title: "QR Tracker",
    tagline: "QR codes avec statistiques anonymes",
    nav: {
      create: "Créer",
      codes: "Mes QR codes",
      stats: "Statistiques",
      privacy: "Confidentialité",
    },
    loading: "Chargement…",
    error: "Une erreur est survenue.",
    retry: "Réessayer",
    copy: "Copier",
    copied: "Copié !",
    close: "Fermer",
  },
  errors: {
    VALIDATION_ERROR: "Les informations saisies sont invalides.",
    TARGET_URL_INVALID:
      "Cette adresse ne peut pas être utilisée (seuls les liens http/https publics sont acceptés).",
    TURNSTILE_FAILED: "La vérification anti-robot a échoué. Rechargez la page et réessayez.",
    UNAUTHORIZED: "Clé secrète invalide.",
    FORBIDDEN: "Ce lien a été bloqué par l'administrateur.",
    NOT_FOUND: "Ce lien n'existe pas (ou a été supprimé).",
    RATE_LIMITED: "Trop de requêtes. Patientez un instant puis réessayez.",
    INTERNAL: "Erreur du serveur. Réessayez plus tard.",
    NETWORK: "Impossible de contacter le serveur. Vérifiez votre connexion.",
  },
  create: {
    title: "Créer un QR code",
    intro:
      "Générez un QR code gratuit pour n'importe quelle adresse web et suivez le nombre de scans. Aucun compte nécessaire.",
    urlLabel: "Adresse de destination",
    urlPlaceholder: "https://exemple.org/ma-page",
    labelLabel: "Nom (optionnel, pour vous y retrouver)",
    labelPlaceholder: "Affiche couloir bâtiment B",
    submit: "Créer le QR code",
    creating: "Création…",
    turnstileLoading: "Vérification anti-robot en cours…",
    urlInvalid: "Adresse invalide : utilisez un lien http(s) public.",
    success: "QR code créé !",
    downloadPng: "Télécharger PNG (impression)",
    downloadSvg: "Télécharger SVG",
    shortLink: "Lien court",
    keyTitle: "Clé secrète — affichée une seule fois",
    keyWarning:
      "Conservez cette clé précieusement : elle donne accès aux statistiques et à la gestion de ce QR code. Elle ne pourra jamais être réaffichée ni récupérée.",
    keySaved: "J'ai sauvegardé ma clé",
    statsLink: "Lien privé vers les statistiques (à mettre en favori)",
    statsLinkHint:
      "Ce lien contient votre clé secrète après le symbole # : elle n'est jamais envoyée au serveur.",
    savedLocally: "Ce QR code a été ajouté à « Mes QR codes » sur ce navigateur uniquement.",
  },
  codes: {
    title: "Mes QR codes",
    intro:
      "Liste stockée uniquement sur ce navigateur. Exportez-la en JSON pour la sauvegarder ou la transférer.",
    empty: "Aucun QR code enregistré sur ce navigateur pour l'instant.",
    columns: { label: "Nom", slug: "Code", created: "Créé le", actions: "Actions" },
    open: "Statistiques",
    remove: "Retirer de la liste",
    removeConfirm:
      "Retirer ce QR code de la liste locale ? (Le lien continuera de fonctionner ; sans la clé, les statistiques seront inaccessibles.)",
    export: "Exporter (JSON)",
    import: "Importer (JSON)",
    importError: "Fichier invalide : impossible d'importer cette liste.",
    importSuccess: (n: number) => `${n} QR code(s) importé(s).`,
    noLabel: "(sans nom)",
  },
  statsEntry: {
    title: "Consulter des statistiques",
    intro: "Entrez le code du lien et sa clé secrète.",
    slugLabel: "Code du lien (7 caractères)",
    keyLabel: "Clé secrète",
    submit: "Voir les statistiques",
    invalid: "Code ou clé au format invalide.",
  },
  stats: {
    title: "Statistiques",
    loading: "Chargement des statistiques…",
    totals: {
      scans: "Scans",
      uniqueVisitors: "Visiteurs uniques (approx.)",
      firstScan: "Premier scan",
      lastScan: "Dernier scan",
      never: "—",
    },
    range: {
      from: "Du",
      to: "Au",
      apply: "Appliquer",
      last7: "7 jours",
      last30: "30 jours",
      all: "Tout",
    },
    includeBots: "Inclure les robots et aperçus de liens",
    charts: {
      byDay: "Scans par jour",
      byHour: "Scans par heure",
      hourOfDay: "Répartition par heure de la journée",
      dayOfWeek: "Répartition par jour de la semaine",
      tableAlt: "Données du graphique en tableau",
    },
    tops: {
      countries: "Pays",
      cities: "Villes",
      devices: "Appareils",
      os: "Systèmes",
      browsers: "Navigateurs",
      languages: "Langues",
      isps: "Opérateurs",
      unknown: "Inconnu",
      scans: "scans",
    },
    devices: { mobile: "Mobile", tablet: "Tablette", desktop: "Ordinateur", other: "Autre" },
    days: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
    exportCsv: "Exporter les scans (CSV)",
    empty: "Aucun scan sur cette période.",
    manage: {
      title: "Gérer ce QR code",
      targetLabel: "Adresse de destination",
      save: "Enregistrer",
      saved: "Destination mise à jour.",
      disable: "Désactiver le lien",
      enable: "Réactiver le lien",
      disabledBadge: "Désactivé",
      blockedBadge: "Bloqué par l'administrateur",
      delete: "Supprimer définitivement",
      deleteConfirm:
        "Supprimer définitivement ce QR code et toutes ses statistiques ? Cette action est irréversible et le QR code imprimé cessera de fonctionner.",
      deleted: "QR code supprimé.",
    },
  },
  privacy: {
    title: "Confidentialité",
  },
  notFound: {
    title: "Page introuvable",
    body: "Cette page n'existe pas.",
    home: "Retour à l'accueil",
  },
} as const;

export type FrStrings = typeof fr;
