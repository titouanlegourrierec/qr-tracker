import { secretKeySchema } from "@qr-tracker/shared";
import { useState } from "react";
import type { SubmitEvent } from "react";
import { useNavigate } from "react-router";

import { en } from "../i18n/en.js";
import { parseSlugInput, parseStatsLink } from "../lib/short-link.js";

/** Manual access to a dashboard: the pasted private link, or the code + secret key. */
export function StatsEntryPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    // The whole private link carries both parts; otherwise the code (or its short link)
    // plus the key typed separately.
    const pasted = parseStatsLink(code);
    const slug = pasted?.slug ?? parseSlugInput(code);
    const secretKey = pasted?.secretKey ?? key.trim();
    if (slug === null || !secretKeySchema.safeParse(secretKey).success) {
      setError(en.statsEntry.invalidEntry);
      return;
    }
    // The key only ever lives in the URL fragment (hash routing) — never sent to a server.
    void navigate(`/stats/${slug}/${secretKey}`);
  }

  return (
    <>
      <h1>{en.statsEntry.title}</h1>
      <p className="muted">{en.statsEntry.intro}</p>
      <form className="card" onSubmit={onSubmit}>
        <div className="field">
          <label>
            <span>{en.statsEntry.slugLabel}</span>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
              }}
              aria-describedby="stats-entry-code-hint"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <small id="stats-entry-code-hint" className="field-hint">
            {en.statsEntry.slugHint}
          </small>
        </div>
        <div className="field">
          <label>
            <span>{en.statsEntry.keyLabel}</span>
            <input
              type="password"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
              }}
              aria-describedby="stats-entry-key-hint"
              autoComplete="off"
            />
          </label>
          <small id="stats-entry-key-hint" className="field-hint">
            {en.statsEntry.keyHint}
          </small>
        </div>
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
