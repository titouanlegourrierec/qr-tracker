import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { TURNSTILE_SITE_KEY } from "../config.js";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile !== undefined) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Turnstile"));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

export interface TurnstileState {
  /** Attach to the widget container div. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Fresh token, or null while the challenge is loading/expired. */
  token: string | null;
  /** True when the script or challenge failed to load. */
  failed: boolean;
  /** Resets the widget (after a submit consumes the token). */
  reset: () => void;
}

/** Renders an invisible-friendly Turnstile widget and exposes its token. */
export function useTurnstile(): TurnstileState {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        const container = containerRef.current;
        if (cancelled || container === null || widgetIdRef.current !== null) return;
        if (window.turnstile === undefined) {
          setFailed(true);
          return;
        }
        widgetIdRef.current = window.turnstile.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "auto",
          // Fills the container instead of a fixed 300px (overflows small phones).
          size: "flexible",
          callback: (freshToken) => {
            setToken(freshToken);
          },
          "expired-callback": () => {
            setToken(null);
          },
          "error-callback": () => {
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current);
  }, []);

  return { containerRef, token, failed, reset };
}
