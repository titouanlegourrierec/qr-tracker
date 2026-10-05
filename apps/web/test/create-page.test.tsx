import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadCodes } from "../src/lib/storage.js";
import { CreatePage } from "../src/pages/CreatePage.js";

import { KEY, server, SLUG } from "./msw.js";

vi.mock("../src/lib/qr.js", () => ({
  qrSvg: () => Promise.resolve("<svg><title>qr</title></svg>"),
  qrPngDataUrl: () => Promise.resolve("data:image/png;base64,AAAA"),
}));

const API = "http://localhost:8787";

const resetSpy = vi.fn();

/** Fake Turnstile: renders synchronously and hands out a token immediately. */
function stubTurnstile(): void {
  resetSpy.mockClear();
  window.turnstile = {
    render: (_el, options) => {
      options.callback("test-token");
      return "widget-1";
    },
    reset: resetSpy,
    remove: vi.fn(),
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CreatePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  stubTurnstile();
});

afterEach(() => {
  delete (window as { turnstile?: unknown }).turnstile;
  vi.restoreAllMocks();
});

describe("CreatePage", () => {
  it("creates a QR code and shows the key exactly once with a warning", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/api/links`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.turnstileToken).toBe("test-token");
        expect(body.label).toBe("Poster");
        return HttpResponse.json(
          { slug: SLUG, shortUrl: `${API}/r/${SLUG}`, secretKey: KEY },
          { status: 201 },
        );
      }),
    );

    renderPage();
    const submit = screen.getByRole("button", { name: "Create QR code" });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });

    await user.type(screen.getByLabelText(/Destination address/), "https://example.org/page");
    await user.type(screen.getByLabelText(/Name/), "Poster");
    await user.click(submit);

    expect(await screen.findByRole("status")).toHaveTextContent("QR code created!");
    expect(screen.getByText(/shown only once/)).toBeInTheDocument();
    expect(screen.getByText(KEY)).toBeInTheDocument();
    expect(screen.getByAltText(`QR code for ${API}/r/${SLUG}`)).toBeInTheDocument();
    // The private stats link keeps the key in the fragment.
    expect(screen.getByText(new RegExp(`#/stats/${SLUG}/`))).toBeInTheDocument();

    // Saved to the local list.
    const codes = loadCodes();
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatchObject({ slug: SLUG, secretKey: KEY, label: "Poster" });
  });

  async function createOne(user: ReturnType<typeof userEvent.setup>) {
    server.use(
      http.post(`${API}/api/links`, () =>
        HttpResponse.json(
          { slug: SLUG, shortUrl: `${API}/r/${SLUG}`, secretKey: KEY },
          { status: 201 },
        ),
      ),
    );
    renderPage();
    const submit = screen.getByRole("button", { name: "Create QR code" });
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
    await user.type(screen.getByLabelText(/Destination address/), "https://example.org/page");
    await user.click(submit);
    return await screen.findByRole("status");
  }

  function leavePage(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it("moves focus to the result and names each copy button", async () => {
    const user = userEvent.setup();
    const status = await createOne(user);
    expect(status).toHaveFocus();
    for (const name of ["Copy link", "Copy key", "Copy private link"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("asks before leaving until the key is confirmed as saved", async () => {
    const user = userEvent.setup();
    await createOne(user);
    expect(leavePage()).toBe(true);

    await user.click(screen.getByRole("checkbox", { name: /saved my secret key/ }));
    expect(leavePage()).toBe(false);

    await user.click(screen.getByRole("checkbox", { name: /saved my secret key/ }));
    expect(leavePage()).toBe(true);
  });

  it("says so when the browser could not keep the code in My QR codes", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    await createOne(user);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not keep a copy/);
    expect(screen.queryByText(/was added to “My QR codes”/)).not.toBeInTheDocument();
  });

  it("pre-validates the URL client-side", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create QR code" })).toBeEnabled();
    });
    await user.type(screen.getByLabelText(/Destination address/), "http://localhost:3000");
    await user.click(screen.getByRole("button", { name: "Create QR code" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid address");
  });

  it("shows a friendly message for API errors and resets Turnstile", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/api/links`, () =>
        HttpResponse.json(
          { error: { code: "RATE_LIMITED", message: "Too many requests" } },
          { status: 429 },
        ),
      ),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create QR code" })).toBeEnabled();
    });
    await user.type(screen.getByLabelText(/Destination address/), "https://example.org");
    await user.click(screen.getByRole("button", { name: "Create QR code" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
    expect(resetSpy).toHaveBeenCalled();
  });

  it("keeps the submit button disabled until Turnstile provides a token", () => {
    window.turnstile = {
      render: () => "widget-1", // never calls back
      reset: vi.fn(),
      remove: vi.fn(),
    };
    renderPage();
    expect(screen.getByRole("button", { name: "Create QR code" })).toBeDisabled();
    expect(screen.getByText(/Anti-bot verification/)).toBeInTheDocument();
  });
});
