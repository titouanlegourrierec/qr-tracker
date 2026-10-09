import { Link } from "react-router";

import { CONTACT_EMAIL } from "../config.js";
import { en } from "../i18n/en.js";

/**
 * Legal notice (publisher, hosts, data controller). Like the privacy page, the content is
 * inline prose rather than en.ts strings: it is a legal-style document.
 */
export function LegalPage() {
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <>
      <h1>{en.legal.title}</h1>

      <h2>Publisher</h2>
      <p>
        QR Tracker is a free, non-commercial project published by Titouan Le Gourrierec, who is also
        responsible for its content (director of publication).
        <br />
        Contact: {mail}
      </p>

      <h2>Hosting</h2>
      <ul>
        <li>
          Web app: GitHub Pages — GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA
          94107, United States.
        </li>
        <li>
          Short links and API: Cloudflare Workers — Cloudflare, Inc., 101 Townsend Street, San
          Francisco, CA 94107, United States.
        </li>
      </ul>

      <h2>Personal data</h2>
      <p>
        The data controller is Titouan Le Gourrierec ({mail}). What is collected, why and for how
        long is described on the <Link to="/privacy">privacy page</Link>. The processing relies on
        the publisher&apos;s legitimate interest (Article 6(1)(f) GDPR): operating and securing the
        service, and giving QR code owners anonymous scan statistics. GitHub and Cloudflare act as
        hosts and process data on the publisher&apos;s behalf, under their own data protection
        terms.
      </p>
      <p>
        You can ask for access to, correction or deletion of data about you, or object to its
        processing, by writing to {mail}. You can also lodge a complaint with a data protection
        authority — in France, the <a href="https://www.cnil.fr/">CNIL</a>.
      </p>

      <h2>Abuse</h2>
      <p>
        To report a QR code that leads to a scam, malware or illegal content, use the{" "}
        <Link to="/report">report form</Link> or write to {mail}.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The source code is released under the MIT license. QR codes and the destinations they point
        to belong to the people who created them.
      </p>
    </>
  );
}
