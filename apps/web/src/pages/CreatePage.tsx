import { validateTargetUrl } from "@qr-tracker/shared";
import type { CreateLinkResponse } from "@qr-tracker/shared";
import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { Link } from "react-router";

import { CopyButton } from "../components/CopyButton.js";
import { useTurnstile } from "../hooks/useTurnstile.js";
import { en } from "../i18n/en.js";
import { api, ApiRequestError } from "../lib/api.js";
import { downloadBlob, downloadUrl } from "../lib/download.js";
import { qrPngDataUrl, qrSvg } from "../lib/qr.js";
import { privateStatsUrl } from "../lib/short-link.js";
import { saveCode } from "../lib/storage.js";

interface Created {
  response: CreateLinkResponse;
  /** False when this browser refused to keep the code in "My QR codes". */
  savedLocally: boolean;
}

function CreationResult({ created: { response: created, savedLocally } }: { created: Created }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const successRef = useRef<HTMLParagraphElement>(null);
  const statsUrl = privateStatsUrl(created.slug, created.secretKey);

  // The form was just replaced under the keyboard focus: move it to the confirmation.
  useEffect(() => {
    successRef.current?.focus();
  }, []);

  // The key is shown only once: until its owner confirms they kept it, closing or
  // reloading the tab asks for confirmation first.
  useEffect(() => {
    if (keySaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [keySaved]);

  useEffect(() => {
    let cancelled = false;
    qrSvg(created.shortUrl)
      .then((markup) => {
        if (!cancelled) setSvg(markup);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [created.shortUrl]);

  return (
    <section aria-label={en.create.success}>
      <p ref={successRef} className="success-box" role="status" tabIndex={-1}>
        {en.create.success}
      </p>

      <div className="card">
        <div className="qr-preview">
          {svg !== null && (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
              alt={en.create.qrAlt(created.shortUrl)}
            />
          )}
          <div>
            <p className="muted">{en.create.shortLink}</p>
            <div className="copy-row">
              <code>{created.shortUrl}</code>
              <CopyButton value={created.shortUrl} label={en.create.copyShortLink} />
            </div>
            <div className="actions-row">
              <button
                type="button"
                onClick={() => {
                  setDownloadFailed(false);
                  qrPngDataUrl(created.shortUrl).then(
                    (url) => {
                      downloadUrl(url, `qr-${created.slug}.png`);
                    },
                    () => {
                      setDownloadFailed(true);
                    },
                  );
                }}
              >
                {en.create.downloadPng}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDownloadFailed(false);
                  qrSvg(created.shortUrl).then(
                    (markup) => {
                      downloadBlob(
                        new Blob([markup], { type: "image/svg+xml" }),
                        `qr-${created.slug}.svg`,
                      );
                    },
                    () => {
                      setDownloadFailed(true);
                    },
                  );
                }}
              >
                {en.create.downloadSvg}
              </button>
            </div>
            {downloadFailed && (
              <p className="error-box" role="alert">
                {en.create.downloadFailed}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="warning-box">
        <h2>{en.create.keyTitle}</h2>
        <p>{en.create.keyWarning}</p>
        <div className="copy-row">
          <code>{created.secretKey}</code>
          <CopyButton value={created.secretKey} label={en.create.copyKey} />
        </div>
        <label className="checkbox-label key-saved">
          <input
            type="checkbox"
            checked={keySaved}
            onChange={(e) => {
              setKeySaved(e.target.checked);
            }}
          />
          {en.create.keySaved}
        </label>
      </div>

      <div className="card">
        <p>{en.create.statsLink}</p>
        <div className="copy-row">
          <code>{statsUrl}</code>
          <CopyButton value={statsUrl} label={en.create.copyStatsLink} />
        </div>
        <p className="muted">{en.create.statsLinkHint}</p>
        {savedLocally ? (
          <p className="muted">
            {en.create.savedLocally} (<Link to="/codes">{en.app.nav.codes}</Link>)
          </p>
        ) : (
          <p className="error-box" role="alert">
            {en.create.notSavedLocally}
          </p>
        )}
      </div>
    </section>
  );
}

export function CreatePage() {
  const {
    containerRef: turnstileRef,
    token: turnstileToken,
    failed: turnstileFailed,
    reset: resetTurnstile,
  } = useTurnstile();
  const [targetUrl, setTargetUrl] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanUrl = targetUrl.trim();
    if (!validateTargetUrl(cleanUrl).ok) {
      setError(en.create.urlInvalid);
      return;
    }
    if (turnstileToken === null) return;

    const cleanLabel = label.trim();
    setSubmitting(true);
    api
      .createLink({
        targetUrl: cleanUrl,
        ...(cleanLabel === "" ? {} : { label: cleanLabel }),
        turnstileToken,
      })
      .then((response) => {
        const savedLocally = saveCode({
          slug: response.slug,
          label: cleanLabel === "" ? null : cleanLabel,
          secretKey: response.secretKey,
          createdAt: new Date().toISOString(),
        });
        setCreated({ response, savedLocally });
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? en.errors[err.code] : en.app.error);
        resetTurnstile();
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  if (created !== null) {
    return (
      <>
        <h1>{en.create.title}</h1>
        <CreationResult created={created} />
      </>
    );
  }

  return (
    <>
      <h1>{en.create.title}</h1>
      <p className="muted">{en.create.intro}</p>
      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>{en.create.urlLabel}</span>
          <input
            type="url"
            value={targetUrl}
            onChange={(e) => {
              setTargetUrl(e.target.value);
            }}
            placeholder={en.create.urlPlaceholder}
            required
          />
        </label>
        <label className="field">
          <span>{en.create.labelLabel}</span>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
            placeholder={en.create.labelPlaceholder}
            maxLength={100}
          />
        </label>

        <div ref={turnstileRef} />
        {turnstileFailed && (
          <p className="error-box" role="alert">
            {en.errors.TURNSTILE_FAILED}
          </p>
        )}
        {!turnstileFailed && turnstileToken === null && (
          <p className="muted" role="status">
            {en.create.turnstileLoading}
          </p>
        )}

        {error !== null && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary" disabled={submitting || turnstileToken === null}>
          {submitting ? en.create.creating : en.create.submit}
        </button>
      </form>
    </>
  );
}
