import { en } from "../i18n/en.js";

/** Shown instead of the app when another site embeds it in a frame (see lib/framing.ts). */
export function FramedNotice() {
  // The app's own address without the fragment, which may hold a secret key.
  const appUrl = `${window.location.origin}${window.location.pathname}`;
  return (
    <main id="main" className="framed-notice">
      <h1>{en.app.title}</h1>
      <p>{en.app.framed}</p>
      <a href={appUrl} target="_blank" rel="noopener noreferrer">
        {en.app.openDirectly}
      </a>
    </main>
  );
}
