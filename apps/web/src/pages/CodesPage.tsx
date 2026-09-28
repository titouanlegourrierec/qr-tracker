import { fr } from "../i18n/fr.js";

// Implemented in milestone M8 (localStorage list + JSON import/export).
export function CodesPage() {
  return (
    <>
      <h1>{fr.codes.title}</h1>
      <p className="muted">{fr.codes.intro}</p>
    </>
  );
}
