import type { TopEntry } from "@qr-tracker/shared";

import { en } from "../i18n/en.js";

/** Maps raw dimension values to display labels (device types are localized). */
function display(value: string | null): string {
  if (value === null) return en.stats.tops.unknown;
  if (value in en.stats.devices) {
    return en.stats.devices[value as keyof typeof en.stats.devices];
  }
  return value;
}

export function TopList({ title, entries }: { title: string; entries: TopEntry[] }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <p className="muted">{en.stats.empty}</p>
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
                  {entry.count} {en.stats.tops.scans}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
