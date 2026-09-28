import { fr } from "../i18n/fr.js";

/**
 * Static privacy page. Content is intentionally inline French prose (not in
 * fr.ts): it is a legal-style document, not reusable UI strings.
 */
export function PrivacyPage() {
  return (
    <>
      <h1>{fr.privacy.title}</h1>

      <h2>Ce que nous collectons à chaque scan</h2>
      <p>
        Lorsqu'une personne scanne un QR code, la redirection passe par notre serveur, qui
        enregistre des données <strong>anonymes</strong> :
      </p>
      <ul>
        <li>la date et l'heure du scan (UTC) ;</li>
        <li>
          le pays, la région, la ville et le fuseau horaire approximatifs (déduits du réseau) ;
        </li>
        <li>l'opérateur ou fournisseur d'accès (organisation du réseau) ;</li>
        <li>
          le type d'appareil (mobile, tablette, ordinateur), la famille de système d'exploitation et
          de navigateur — jamais les versions exactes ;
        </li>
        <li>la langue principale du navigateur (ex. « fr ») ;</li>
        <li>un indicateur « robot » pour les aperçus de liens et moteurs de recherche ;</li>
        <li>
          une empreinte de visiteur : un condensat cryptographique (SHA-256) combinant un sel
          aléatoire <em>renouvelé chaque jour</em>, l'adresse IP et le navigateur.
        </li>
      </ul>

      <h2>Ce que nous ne collectons pas</h2>
      <ul>
        <li>
          <strong>Aucune adresse IP n'est enregistrée</strong> ni journalisée ; elle n'est utilisée
          qu'en mémoire, quelques millisecondes, pour calculer l'empreinte du jour.
        </li>
        <li>Aucune chaîne complète de navigateur (user-agent) n'est conservée.</li>
        <li>
          Aucun cookie, aucun traceur, aucun outil d'analyse tiers — ni sur ce site, ni lors des
          scans.
        </li>
        <li>
          Aucun identifiant permanent : les sels de la veille sont détruits chaque jour, il est donc
          impossible de relier les scans d'un même visiteur d'un jour à l'autre. Les « visiteurs
          uniques » sont une approximation par jour.
        </li>
      </ul>

      <h2>Durée de conservation</h2>
      <p>
        Les scans sont conservés <strong>12 mois</strong> puis supprimés automatiquement chaque
        nuit. Les sels quotidiens sont supprimés au bout d'un jour.
      </p>

      <h2>Suppression des données</h2>
      <p>
        La personne qui possède la clé secrète d'un QR code peut à tout moment supprimer
        définitivement le lien <em>et toutes ses statistiques</em> depuis la page de gestion. Pour
        toute autre demande, ouvrez un ticket sur{" "}
        <a href="https://github.com/titouanlegourrierec/qr-tracker/issues">GitHub</a>.
      </p>

      <h2>Et ce site ?</h2>
      <p>
        Ce site n'utilise aucun cookie. La liste « Mes QR codes » est stockée uniquement dans votre
        navigateur (localStorage) et ne quitte jamais votre appareil. La création d'un QR code est
        protégée par Cloudflare Turnstile, qui effectue une vérification anti-robot sans cookie ni
        suivi publicitaire.
      </p>
    </>
  );
}
