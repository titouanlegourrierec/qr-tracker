import { validateTargetUrl } from "@qr-tracker/shared";
import type { Link } from "@qr-tracker/shared";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useNavigate } from "react-router";

import { fr } from "../i18n/fr.js";
import { api, ApiRequestError } from "../lib/api.js";
import { removeCode } from "../lib/storage.js";

function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? fr.errors[err.code] : fr.app.error;
}

export interface ManagePanelProps {
  link: Link;
  secretKey: string;
  onUpdated: (link: Link) => void;
}

/** Owner management: edit destination, disable/enable, permanent delete. */
export function ManagePanel({ link, secretKey, onUpdated }: ManagePanelProps) {
  const navigate = useNavigate();
  const [targetUrl, setTargetUrl] = useState(link.targetUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const blocked = link.status === "blocked";

  function run(action: () => Promise<void>): void {
    setBusy(true);
    setMessage(null);
    setError(null);
    action()
      .catch((err: unknown) => {
        setError(errorMessage(err));
      })
      .finally(() => {
        setBusy(false);
      });
  }

  function onSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = targetUrl.trim();
    if (!validateTargetUrl(clean).ok) {
      setError(fr.create.urlInvalid);
      return;
    }
    run(async () => {
      onUpdated(await api.updateLink(link.slug, secretKey, { targetUrl: clean }));
      setMessage(fr.stats.manage.saved);
    });
  }

  function onToggleStatus() {
    const status = link.status === "active" ? "disabled" : "active";
    run(async () => {
      onUpdated(await api.updateLink(link.slug, secretKey, { status }));
    });
  }

  function onDelete() {
    if (!window.confirm(fr.stats.manage.deleteConfirm)) return;
    run(async () => {
      await api.deleteLink(link.slug, secretKey);
      removeCode(link.slug);
      await navigate("/codes");
    });
  }

  return (
    <section className="card" aria-label={fr.stats.manage.title}>
      <h2>{fr.stats.manage.title}</h2>

      {blocked && <p className="badge">{fr.stats.manage.blockedBadge}</p>}
      {link.status === "disabled" && <p className="badge">{fr.stats.manage.disabledBadge}</p>}

      {message !== null && (
        <p className="success-box" role="status">
          {message}
        </p>
      )}
      {error !== null && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}

      {!blocked && (
        <>
          <form onSubmit={onSave}>
            <label className="field">
              <span>{fr.stats.manage.targetLabel}</span>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => {
                  setTargetUrl(e.target.value);
                }}
                required
              />
            </label>
            <div className="actions-row">
              <button type="submit" className="primary" disabled={busy}>
                {fr.stats.manage.save}
              </button>
              <button type="button" disabled={busy} onClick={onToggleStatus}>
                {link.status === "active" ? fr.stats.manage.disable : fr.stats.manage.enable}
              </button>
            </div>
          </form>
        </>
      )}

      <div className="actions-row">
        <button type="button" className="danger" disabled={busy} onClick={onDelete}>
          {fr.stats.manage.delete}
        </button>
      </div>
    </section>
  );
}
