import { validateTargetUrl } from "@qr-tracker/shared";
import type { CreateLinkResponse } from "@qr-tracker/shared";
import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { Link } from "react-router";

import { CopyButton } from "../components/CopyButton.js";
import { useTurnstile } from "../hooks/useTurnstile.js";
import { fr } from "../i18n/fr.js";
import { api, ApiRequestError } from "../lib/api.js";
import { downloadBlob, downloadUrl } from "../lib/download.js";
import { qrPngDataUrl, qrSvg } from "../lib/qr.js";
import { saveCode } from "../lib/storage.js";

/** Private dashboard URL — the key lives only in the fragment (never sent anywhere). */
function buildStatsUrl(slug: string, secretKey: string): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#/stats/${slug}/${secretKey}`;
}

function CreationResult({ created }: { created: CreateLinkResponse }) {
  const [svg, setSvg] = useState<string | null>(null);
  const statsUrl = buildStatsUrl(created.slug, created.secretKey);

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
    <section aria-label={fr.create.success}>
      <p className="success-box" role="status">
        {fr.create.success}
      </p>

      <div className="card">
        <div className="qr-preview">
          {svg !== null && (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
              alt={`QR code vers ${created.shortUrl}`}
            />
          )}
          <div>
            <p className="muted">{fr.create.shortLink}</p>
            <div className="copy-row">
              <code>{created.shortUrl}</code>
              <CopyButton value={created.shortUrl} />
            </div>
            <div className="actions-row">
              <button
                type="button"
                onClick={() => {
                  void qrPngDataUrl(created.shortUrl).then((url) => {
                    downloadUrl(url, `qr-${created.slug}.png`);
                  });
                }}
              >
                {fr.create.downloadPng}
              </button>
              <button
                type="button"
                onClick={() => {
                  void qrSvg(created.shortUrl).then((markup) => {
                    downloadBlob(
                      new Blob([markup], { type: "image/svg+xml" }),
                      `qr-${created.slug}.svg`,
                    );
                  });
                }}
              >
                {fr.create.downloadSvg}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="warning-box">
        <h2>{fr.create.keyTitle}</h2>
        <p>{fr.create.keyWarning}</p>
        <div className="copy-row">
          <code>{created.secretKey}</code>
          <CopyButton value={created.secretKey} />
        </div>
      </div>

      <div className="card">
        <p>{fr.create.statsLink}</p>
        <div className="copy-row">
          <code>{statsUrl}</code>
          <CopyButton value={statsUrl} />
        </div>
        <p className="muted">{fr.create.statsLinkHint}</p>
        <p className="muted">
          {fr.create.savedLocally} (<Link to="/codes">{fr.app.nav.codes}</Link>)
        </p>
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
  const [created, setCreated] = useState<CreateLinkResponse | null>(null);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanUrl = targetUrl.trim();
    if (!validateTargetUrl(cleanUrl).ok) {
      setError(fr.create.urlInvalid);
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
        saveCode({
          slug: response.slug,
          label: cleanLabel === "" ? null : cleanLabel,
          secretKey: response.secretKey,
          createdAt: new Date().toISOString(),
        });
        setCreated(response);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? fr.errors[err.code] : fr.app.error);
        resetTurnstile();
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  if (created !== null) {
    return (
      <>
        <h1>{fr.create.title}</h1>
        <CreationResult created={created} />
      </>
    );
  }

  return (
    <>
      <h1>{fr.create.title}</h1>
      <p className="muted">{fr.create.intro}</p>
      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>{fr.create.urlLabel}</span>
          <input
            type="url"
            value={targetUrl}
            onChange={(e) => {
              setTargetUrl(e.target.value);
            }}
            placeholder={fr.create.urlPlaceholder}
            required
          />
        </label>
        <label className="field">
          <span>{fr.create.labelLabel}</span>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
            placeholder={fr.create.labelPlaceholder}
            maxLength={100}
          />
        </label>

        <div ref={turnstileRef} />
        {turnstileFailed && (
          <p className="error-box" role="alert">
            {fr.errors.TURNSTILE_FAILED}
          </p>
        )}
        {!turnstileFailed && turnstileToken === null && (
          <p className="muted" role="status">
            {fr.create.turnstileLoading}
          </p>
        )}

        {error !== null && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="primary" disabled={submitting || turnstileToken === null}>
          {submitting ? fr.create.creating : fr.create.submit}
        </button>
      </form>
    </>
  );
}
