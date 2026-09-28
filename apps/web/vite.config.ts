import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";

/**
 * Injects the Content Security Policy at build time only (GitHub Pages cannot
 * set headers). Not applied in dev: it would break Vite's HMR inline scripts.
 */
function cspPlugin(apiOrigin: string): Plugin {
  const csp = [
    "default-src 'none'",
    "script-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${apiOrigin} https://challenges.cloudflare.com`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
  ].join("; ");
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<!-- CSP_PLACEHOLDER -->",
        `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
      );
    },
  };
}

function resolveApiOrigin(raw: string | undefined): string {
  // Empty/invalid values must not break the build: on the very first deploy,
  // the VITE_API_URL repo variable may not exist yet (see docs/DEPLOYMENT.md §7).
  try {
    if (raw !== undefined && raw !== "") return new URL(raw).origin;
  } catch {
    console.warn(`[qr-tracker] Invalid VITE_API_URL "${raw}" — falling back to localhost.`);
  }
  console.warn("[qr-tracker] VITE_API_URL is not set — building against http://localhost:8787.");
  return "http://localhost:8787";
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  const apiOrigin = resolveApiOrigin(env.VITE_API_URL);
  if (mode === "production" && (env.VITE_TURNSTILE_SITE_KEY ?? "").startsWith("1x0000")) {
    console.warn(
      "[qr-tracker] Building with the Turnstile TEST sitekey — real visitors will fail verification. Set the VITE_TURNSTILE_SITE_KEY repo variable.",
    );
  }
  return {
    base: "/qr-tracker/",
    plugins: [react(), cspPlugin(apiOrigin)],
    build: {
      sourcemap: false,
    },
  };
});
