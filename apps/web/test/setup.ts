import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./msw.js";

// Node >= 25 defines an experimental globalThis.localStorage (undefined unless
// node runs with --localstorage-file), which shadows jsdom's Storage because
// Vitest only copies window keys that are absent from the global. Restore the
// real jsdom Storage objects (the environment exposes the JSDOM instance).
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom;
if (dom !== undefined && typeof globalThis.localStorage === "undefined") {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {
      value: dom.window[key],
      configurable: true,
    });
  }
}

beforeAll(() => {
  // msw 3 renamed onUnhandledRequest to onUnhandledFrame (it also covers WebSockets).
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
});

afterAll(() => {
  server.close();
});
