import { MAX_REPORT_DETAILS_LENGTH, reportReasonSchema } from "@qr-tracker/shared";
import type { ReportReason } from "@qr-tracker/shared";
import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useSearchParams } from "react-router";

import { useTurnstile } from "../hooks/useTurnstile.js";
import { en } from "../i18n/en.js";
import { api, ApiRequestError } from "../lib/api.js";
import { parseSlugInput } from "../lib/short-link.js";

function ReportForm({ initialCode, onSent }: { initialCode: string; onSent: () => void }) {
  const {
    containerRef: turnstileRef,
    token: turnstileToken,
    failed: turnstileFailed,
    reset: resetTurnstile,
  } = useTurnstile();
  const [code, setCode] = useState(initialCode);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const slug = parseSlugInput(code);
    if (slug === null) {
      setError(en.report.codeInvalid);
      return;
    }
    // Both are enforced by the form itself (required radio, disabled button).
    if (reason === null || turnstileToken === null) return;

    const cleanDetails = details.trim();
    setSubmitting(true);
    api
      .reportLink({
        slug,
        reason,
        ...(cleanDetails === "" ? {} : { details: cleanDetails }),
        turnstileToken,
      })
      .then(() => {
        onSent();
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiRequestError ? en.errors[err.code] : en.app.error);
        resetTurnstile();
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      {/* Hints sit outside the <label> so they describe the field without
          becoming part of its accessible name. */}
      <div className="field">
        <label>
          <span>{en.report.codeLabel}</span>
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
            }}
            placeholder={en.report.codePlaceholder}
            aria-describedby="report-code-hint"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <small id="report-code-hint" className="field-hint">
          {en.report.codeHint}
        </small>
      </div>

      <fieldset className="choice-group">
        <legend>{en.report.reasonLegend}</legend>
        {reportReasonSchema.options.map((option) => (
          <label key={option} className="choice">
            <input
              type="radio"
              name="reason"
              value={option}
              checked={reason === option}
              onChange={() => {
                setReason(option);
              }}
              required
            />
            {en.report.reasons[option]}
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label>
          <span>{en.report.detailsLabel}</span>
          <textarea
            value={details}
            onChange={(e) => {
              setDetails(e.target.value);
            }}
            maxLength={MAX_REPORT_DETAILS_LENGTH}
            aria-describedby="report-details-hint"
          />
        </label>
        <small id="report-details-hint" className="field-hint">
          {en.report.detailsHint}
        </small>
      </div>

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
        {submitting ? en.report.sending : en.report.submit}
      </button>
    </form>
  );
}

function ReportSent({ onAnother }: { onAnother: () => void }) {
  const messageRef = useRef<HTMLParagraphElement>(null);

  // The form just disappeared under the keyboard focus: move it to the confirmation.
  useEffect(() => {
    messageRef.current?.focus();
  }, []);

  return (
    <>
      <p ref={messageRef} className="success-box" role="status" tabIndex={-1}>
        {en.report.success}
      </p>
      <button type="button" onClick={onAnother}>
        {en.report.another}
      </button>
    </>
  );
}

/** Public abuse report form: anyone can flag a QR code; the operator reviews reports. */
export function ReportPage() {
  const [searchParams] = useSearchParams();
  const [sent, setSent] = useState(false);

  return (
    <>
      <h1>{en.report.title}</h1>
      <p className="muted">{en.report.intro}</p>
      {sent ? (
        <ReportSent
          onAnother={() => {
            setSent(false);
          }}
        />
      ) : (
        <ReportForm
          initialCode={searchParams.get("code") ?? ""}
          onSent={() => {
            setSent(true);
          }}
        />
      )}
    </>
  );
}
