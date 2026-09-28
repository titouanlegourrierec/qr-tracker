import { lazy, Suspense } from "react";

import { en } from "../i18n/en.js";

// Chart.js only loads when a dashboard actually renders (small main bundle).
const ChartCanvas = lazy(() => import("./ChartCanvas.js"));

export interface ChartWithTableProps {
  title: string;
  type: "line" | "bar";
  labels: string[];
  values: number[];
}

/** A chart plus its WCAG data-table alternative. */
export function ChartWithTable({ title, type, labels, values }: ChartWithTableProps) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="chart-box">
        <Suspense fallback={<p className="muted">{en.app.loading}</p>}>
          <ChartCanvas type={type} labels={labels} values={values} label={title} />
        </Suspense>
      </div>
      <details className="chart-data">
        <summary>{en.stats.charts.tableAlt}</summary>
        <div className="table-wrap">
          <table>
            <caption className="muted">{title}</caption>
            <thead>
              <tr>
                <th scope="col">—</th>
                <th scope="col">{en.stats.totals.scans}</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((rowLabel, i) => (
                <tr key={rowLabel}>
                  <th scope="row">{rowLabel}</th>
                  <td>{values[i] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
