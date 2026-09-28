import type { TopEntry } from "@qr-tracker/shared";

import { fr } from "../i18n/fr.js";

/** Maps raw dimension values to display labels (device types are localized). */
function display(value: string | null): string {
  if (value === null) return fr.stats.tops.unknown;
  if (value in fr.stats.devices) {
    return fr.stats.devices[value as keyof typeof fr.stats.devices];
  }
  return value;
}

export function TopList({ title, entries }: { title: string; entries: TopEntry[] }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <p className="muted">{fr.stats.empty}</p>
      ) : (
        <table>
          <caption className="muted" style={{ captionSide: "top", textAlign: "left" }}>
            {title}
          </caption>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.value ?? "__null__"}>
                <th scope="row">{display(entry.value)}</th>
                <td>
                  {entry.count} {fr.stats.tops.scans}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
