import { useRef, useState } from "react";
import { Link } from "react-router";

import { en } from "../i18n/en.js";
import { downloadBlob } from "../lib/download.js";
import { exportCodesJson, importCodesJson, loadCodes, removeCode } from "../lib/storage.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
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
                <th scope="col">{en.codes.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.slug}>
                  <td>{code.label ?? en.codes.noLabel}</td>
                  <td>
                    <code>{code.slug}</code>
                  </td>
                  <td>{formatDate(code.createdAt)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
