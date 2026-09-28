import { secretKeySchema, slugSchema } from "@qr-tracker/shared";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useNavigate } from "react-router";

import { en } from "../i18n/en.js";

/** Manual access to a dashboard: slug + secret key typed by hand. */
export function StatsEntryPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanSlug = slug.trim();
    const cleanKey = key.trim();
    if (!slugSchema.safeParse(cleanSlug).success || !secretKeySchema.safeParse(cleanKey).success) {
      setError(en.statsEntry.invalid);
      return;
    }
    // The key only ever lives in the URL fragment (hash routing) — never sent to a server.
    void navigate(`/stats/${cleanSlug}/${cleanKey}`);
  }

  return (
    <>
      <h1>{en.statsEntry.title}</h1>
      <p className="muted">{en.statsEntry.intro}</p>
      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>{en.statsEntry.slugLabel}</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
            }}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <label className="field">
          <span>{en.statsEntry.keyLabel}</span>
          <input
            type="password"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
            }}
            autoComplete="off"
            required
          />
        </label>
        {error !== null && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary">
          {en.statsEntry.submit}
        </button>
      </form>
    </>
  );
}
