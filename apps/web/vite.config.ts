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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  const apiOrigin = new URL(env.VITE_API_URL ?? "http://localhost:8787").origin;
  return {
    base: "/qr-tracker/",
    plugins: [react(), cspPlugin(apiOrigin)],
    build: {
      sourcemap: false,
    },
  };
});
