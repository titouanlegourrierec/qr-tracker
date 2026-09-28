import { fr } from "../i18n/fr.js";

// Implemented in milestone M8 (create flow: form, Turnstile, QR preview, key display).
export function CreatePage() {
  return (
    <>
      <h1>{fr.create.title}</h1>
      <p className="muted">{fr.create.intro}</p>
    </>
  );
}
