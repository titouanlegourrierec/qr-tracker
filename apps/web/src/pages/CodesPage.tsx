import type { LinkSummary } from "@qr-tracker/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import { en } from "../i18n/en.js";
import { api } from "../lib/api.js";
import { downloadBlob } from "../lib/download.js";
import { exportCodesJson, importCodesJson, loadCodes, removeCode } from "../lib/storage.js";

/** Date in the visitor's own locale (the browser's language settings). */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** True when the dashboard sent us here right after deleting a QR code. */
function cameFromDelete(state: unknown): boolean {
  return (
    typeof state === "object" && state !== null && "deleted" in state && state.deleted === true
  );
}

function SummaryCells({ summary, failed }: { summary: LinkSummary | undefined; failed: boolean }) {
  if (summary === undefined) {
    const placeholder = failed ? en.codes.unavailable : en.codes.pending;
    return (
      <>
        <td>{placeholder}</td>
        <td>{placeholder}</td>
      </>
    );
  }
  if (!summary.ok) {
    return (
      <>
        <td className="muted">
          {summary.error === "NOT_FOUND" ? en.codes.linkDeleted : en.codes.keyInvalid}
        </td>
        <td>{en.codes.unavailable}</td>
      </>
    );
  }
  return (
    <>
      <td>{summary.scans}</td>
      <td>{summary.lastScanAt === null ? en.codes.never : formatDate(summary.lastScanAt)}</td>
    </>
  );
}

export function CodesPage() {
  const location = useLocation();
  const [codes, setCodes] = useState(loadCodes);
  const [message, setMessage] = useState<string | null>(() =>
    cameFromDelete(location.state) ? en.stats.manage.deleted : null,
  );
  const [importError, setImportError] = useState(false);
  const [summaries, setSummaries] = useState<Map<string, LinkSummary>>(() => new Map());
  const [summaryError, setSummaryError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // One request for the whole list; each code is checked against its own key.
  useEffect(() => {
    if (codes.length === 0) return;
    let stale = false;
    api
      .summarizeLinks(codes.map(({ slug, secretKey }) => ({ slug, secretKey })))
      .then((list) => {
        if (stale) return;
        setSummaries(new Map(list.map((summary) => [summary.slug, summary])));
        setSummaryError(false);
      })
      .catch(() => {
        if (!stale) setSummaryError(true);
      });
    return () => {
      stale = true;
    };
  }, [codes, reloadToken]);

  function onImportFile(file: File) {
    setImportError(false);
    setMessage(null);
    file
      .text()
      .then((text) => {
        const added = importCodesJson(text);
        if (added === null) {
          setImportError(true);
          return;
        }
        setCodes(loadCodes());
        setMessage(en.codes.importSuccess(added));
      })
      .catch(() => {
        setImportError(true);
      });
  }

  return (
    <>
      <h1>{en.codes.title}</h1>
      <p className="muted">{en.codes.intro}</p>

      <div className="actions-row">
        <button
          type="button"
          onClick={() => {
            downloadBlob(
              new Blob([exportCodesJson()], { type: "application/json" }),
              "qr-tracker-codes.json",
            );
          }}
        >
          {en.codes.export}
        </button>
        <button
          type="button"
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          {en.codes.import}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label={en.codes.import}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) onImportFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {message !== null && (
        <p className="success-box" role="status">
          {message}
        </p>
      )}
      {importError && (
        <p className="error-box" role="alert">
          {en.codes.importError}
        </p>
      )}
      {summaryError && codes.length > 0 && (
        <div className="error-box" role="alert">
          <p>{en.codes.summaryError}</p>
          <button
            type="button"
            onClick={() => {
              setSummaryError(false);
              setReloadToken((token) => token + 1);
            }}
          >
            {en.app.retry}
          </button>
        </div>
      )}

      {codes.length === 0 ? (
        <p className="card">{en.codes.empty}</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th scope="col">{en.codes.columns.label}</th>
                <th scope="col">{en.codes.columns.slug}</th>
                <th scope="col">{en.codes.columns.created}</th>
                <th scope="col">{en.codes.columns.scans}</th>
                <th scope="col">{en.codes.columns.lastScan}</th>
                <th scope="col">{en.codes.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => {
                const summary = summaries.get(code.slug);
                const status = summary?.ok === true ? summary.status : "active";
                return (
                  <tr key={code.slug}>
                    <td>
                      {code.label ?? en.codes.noLabel}
                      {status !== "active" && (
                        <>
                          {" "}
                          <span className="badge">{en.codes.status[status]}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <code>{code.slug}</code>
                    </td>
                    <td>{formatDate(code.createdAt)}</td>
                    <SummaryCells summary={summary} failed={summaryError} />
                    <td>
                      <div className="actions-row">
                        <Link className="button" to={`/stats/${code.slug}/${code.secretKey}`}>
                          {en.codes.open}
                        </Link>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            if (window.confirm(en.codes.removeConfirm)) {
                              removeCode(code.slug);
                              setCodes(loadCodes());
                            }
                          }}
                        >
                          {en.codes.remove}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
