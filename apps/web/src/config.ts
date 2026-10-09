function nonEmpty(value: string | undefined, fallback: string): string {
  return value === undefined || value === "" ? fallback : value;
}

/** Worker origin (no trailing slash). Overridden at build time by CI. */
export const API_URL = nonEmpty(import.meta.env.VITE_API_URL, "http://localhost:8787").replace(
  /\/+$/,
  "",
);

/** Public Turnstile sitekey; the default is Cloudflare's "always passes" test key. */
export const TURNSTILE_SITE_KEY = nonEmpty(
  import.meta.env.VITE_TURNSTILE_SITE_KEY,
  "1x00000000000000000000AA",
);

/** Public contact of the site's publisher (legal notice, personal-data requests, abuse). */
export const CONTACT_EMAIL = "titouanlegourrierec@kaist.ac.kr";
