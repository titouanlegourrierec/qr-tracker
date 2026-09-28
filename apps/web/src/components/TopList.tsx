import type { TopEntry } from "@qr-tracker/shared";

import { en } from "../i18n/en.js";

export interface TopListProps {
  title: string;
  entries: TopEntry[];
  /** Optional display mapping for raw values (country codes, language tags…). */
  format?: (value: string) => string;
}

export function TopList({ title, entries, format }: TopListProps) {
  const max = entries.reduce((acc, entry) => Math.max(acc, entry.count), 0);
  const display = (value: string | null): string => {
    if (value === null) return en.stats.tops.unknown;
    return format === undefined ? value : format(value);
  };
  return (
    <div className="card">
      <h3>{title}</h3>
      {entries.length === 0 ? (
        <p className="muted">{en.stats.empty}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">{title}</caption>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.value ?? "__null__"}>
                  <th scope="row">{display(entry.value)}</th>
                  <td>
                    <div className="top-cell">
                      <span className="top-count">{en.stats.tops.scanCount(entry.count)}</span>
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
        </div>
      )}
    </div>
  );
}
