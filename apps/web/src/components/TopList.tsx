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
  const max = entries.reduce((acc, entry) => Math.max(acc, entry.count), 0);
  return (
    <div className="card">
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <p className="muted">{en.stats.empty}</p>
      ) : (
        <table>
          <caption className="sr-only">{title}</caption>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.value ?? "__null__"}>
                <th scope="row">{display(entry.value)}</th>
                <td>
                  <div className="top-cell">
                    <span className="top-count">
                      {entry.count} {en.stats.tops.scans}
                    </span>
                    <div className="top-bar" aria-hidden="true">
                      <div
                        className="top-bar-fill"
                        style={{ width: `${max === 0 ? 0 : (entry.count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
