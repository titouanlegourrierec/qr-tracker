import { validateTargetUrl } from "@qr-tracker/shared";
import type { Link } from "@qr-tracker/shared";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useNavigate } from "react-router";

import { en } from "../i18n/en.js";
import { api, ApiRequestError } from "../lib/api.js";
import { privateStatsUrl } from "../lib/short-link.js";
import { loadCodes, removeCode, setStoredViewKey } from "../lib/storage.js";

import { CopyButton } from "./CopyButton.js";

function errorMessage(err: unknown): string {
  return err instanceof ApiRequestError ? en.errors[err.code] : en.app.error;
}

export interface ManagePanelProps {
  link: Link;
  secretKey: string;
  onUpdated: (link: Link) => void;
}

/** The read-only key "My QR codes" kept for this link, if any. */
function storedViewKey(slug: string): string | null {
  return loadCodes().find((code) => code.slug === slug)?.viewKey ?? null;
}

/**
 * Owner management: edit destination, disable/enable, share read-only, permanent delete.
 */
export function ManagePanel({ link, secretKey, onUpdated }: ManagePanelProps) {
  const navigate = useNavigate();
  const [targetUrl, setTargetUrl] = useState(link.targetUrl);
  const [viewKey, setViewKey] = useState<string | null>(() =>
    link.hasViewKey ? storedViewKey(link.slug) : null,
  );
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
      setError(en.create.urlInvalid);
      return;
    }
    run(async () => {
      const updated = await api.updateLink(link.slug, secretKey, { targetUrl: clean });
      // Show the destination as stored (the worker normalizes it, e.g. "https:/x" → "https://x/").
      setTargetUrl(updated.targetUrl);
      onUpdated(updated);
      setMessage(en.stats.manage.saved);
    });
  }

  function onToggleStatus() {
    const status = link.status === "active" ? "disabled" : "active";
    run(async () => {
      onUpdated(await api.updateLink(link.slug, secretKey, { status }));
    });
  }

  function onCreateViewKey() {
    if (link.hasViewKey && !window.confirm(en.stats.share.replaceConfirm)) return;
    run(async () => {
      const created = await api.createViewKey(link.slug, secretKey);
      // Kept with the code in "My QR codes" (when it is there), so it can be copied again.
      setStoredViewKey(link.slug, created.viewKey);
      setViewKey(created.viewKey);
      onUpdated({ ...link, hasViewKey: true });
      setMessage(en.stats.share.created);
    });
  }

  function onRevokeViewKey() {
    if (!window.confirm(en.stats.share.revokeConfirm)) return;
    run(async () => {
      await api.revokeViewKey(link.slug, secretKey);
      setStoredViewKey(link.slug, null);
      setViewKey(null);
      onUpdated({ ...link, hasViewKey: false });
      setMessage(en.stats.share.revoked);
    });
  }

  function onDelete() {
    if (!window.confirm(en.stats.manage.deleteConfirm)) return;
    run(async () => {
      await api.deleteLink(link.slug, secretKey);
      removeCode(link.slug);
      // "My QR codes" confirms the deletion.
      await navigate("/codes", { state: { deleted: true } });
    });
  }

  return (
    <section className="card" aria-label={en.stats.manage.title}>
      <h2>{en.stats.manage.title}</h2>

      {blocked && <p className="badge">{en.stats.manage.blockedBadge}</p>}
      {link.status === "disabled" && <p className="badge">{en.stats.manage.disabledBadge}</p>}

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
              <span>{en.stats.manage.targetLabel}</span>
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
                {en.stats.manage.save}
              </button>
              <button type="button" disabled={busy} onClick={onToggleStatus}>
                {link.status === "active" ? en.stats.manage.disable : en.stats.manage.enable}
              </button>
            </div>
          </form>
        </>
      )}

      <h3>{en.stats.share.title}</h3>
      <p className="muted">{en.stats.share.intro}</p>
      {link.hasViewKey && viewKey !== null && (
        <div className="copy-row" role="group" aria-label={en.stats.share.linkLabel}>
          <code>{privateStatsUrl(link.slug, viewKey)}</code>
          <CopyButton value={privateStatsUrl(link.slug, viewKey)} label={en.stats.share.copy} />
        </div>
      )}
      {link.hasViewKey && viewKey === null && <p className="muted">{en.stats.share.notKept}</p>}
      <div className="actions-row">
        <button type="button" disabled={busy} onClick={onCreateViewKey}>
          {link.hasViewKey ? en.stats.share.replace : en.stats.share.create}
        </button>
        {link.hasViewKey && (
          <button type="button" disabled={busy} onClick={onRevokeViewKey}>
            {en.stats.share.revoke}
          </button>
        )}
      </div>

      <h3>{en.stats.manage.deleteTitle}</h3>
      <div className="actions-row">
        <button type="button" className="danger" disabled={busy} onClick={onDelete}>
          {en.stats.manage.delete}
        </button>
      </div>
    </section>
  );
}
