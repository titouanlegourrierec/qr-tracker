import { useEffect, useRef, useState } from "react";

import { en } from "../i18n/en.js";

/** Copies a value to the clipboard with an accessible confirmation. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          if (timerRef.current !== null) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            setCopied(false);
          }, 2000);
        });
      }}
    >
      <span aria-live="polite">{copied ? en.app.copied : (label ?? en.app.copy)}</span>
    </button>
  );
}
