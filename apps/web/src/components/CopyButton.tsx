import { useEffect, useRef, useState } from "react";

import { en } from "../i18n/en.js";

/** Copies a value to the clipboard with an accessible confirmation. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  function show(next: "copied" | "failed") {
    setState(next);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setState("idle");
    }, 2000);
  }

  const text =
    state === "copied"
      ? en.app.copied
      : state === "failed"
        ? en.app.copyFailed
        : (label ?? en.app.copy);

  return (
    <button
      type="button"
      onClick={() => {
        // Refused without permission or outside a secure context: say so instead of nothing.
        navigator.clipboard.writeText(value).then(
          () => {
            show("copied");
          },
          () => {
            show("failed");
          },
        );
      }}
    >
      <span aria-live="polite">{text}</span>
    </button>
  );
}
