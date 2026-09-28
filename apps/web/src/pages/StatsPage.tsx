import { fr } from "../i18n/fr.js";

// Implemented in milestone M9 (dashboard: charts, tables, filters, management).
export function StatsPage() {
  return (
    <>
      <h1>{fr.stats.title}</h1>
      <p className="muted">{fr.stats.loading}</p>
    </>
  );
}
