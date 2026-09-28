import { useRef, useState } from "react";
import { Link } from "react-router";

import { fr } from "../i18n/fr.js";
import { downloadBlob } from "../lib/download.js";
import { exportCodesJson, importCodesJson, loadCodes, removeCode } from "../lib/storage.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CodesPage() {
  const [codes, setCodes] = useState(loadCodes);
  const [message, setMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        setMessage(fr.codes.importSuccess(added));
      })
      .catch(() => {
        setImportError(true);
      });
  }

  return (
    <>
      <h1>{fr.codes.title}</h1>
      <p className="muted">{fr.codes.intro}</p>

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
          {fr.codes.export}
        </button>
        <button
          type="button"
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          {fr.codes.import}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          aria-label={fr.codes.import}
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
          {fr.codes.importError}
        </p>
      )}

      {codes.length === 0 ? (
        <p className="card">{fr.codes.empty}</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th scope="col">{fr.codes.columns.label}</th>
                <th scope="col">{fr.codes.columns.slug}</th>
                <th scope="col">{fr.codes.columns.created}</th>
                <th scope="col">{fr.codes.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.slug}>
                  <td>{code.label ?? fr.codes.noLabel}</td>
                  <td>
                    <code>{code.slug}</code>
                  </td>
                  <td>{formatDate(code.createdAt)}</td>
                  <td>
                    <div className="actions-row">
                      <Link className="button" to={`/stats/${code.slug}/${code.secretKey}`}>
                        {fr.codes.open}
                      </Link>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          if (window.confirm(fr.codes.removeConfirm)) {
                            removeCode(code.slug);
                            setCodes(loadCodes());
                          }
                        }}
                      >
                        {fr.codes.remove}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
