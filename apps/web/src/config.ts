/** Worker origin (no trailing slash). Overridden at build time by CI. */
export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8787").replace(
  /\/+$/,
  "",
);

/** Public Turnstile sitekey; the default is Cloudflare's "always passes" test key. */
export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";
