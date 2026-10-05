import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReportPage } from "../src/pages/ReportPage.js";

import { server, SLUG } from "./msw.js";

const API = "http://localhost:8787";
const resetSpy = vi.fn();

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

function renderPage(entry = "/report") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/report" element={<ReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function readyToSend() {
  const submit = screen.getByRole("button", { name: "Send report" });
  await waitFor(() => {
    expect(submit).toBeEnabled();
  });
  return submit;
}

beforeEach(() => {
  stubTurnstile();
});

afterEach(() => {
  delete (window as { turnstile?: unknown }).turnstile;
});

describe("ReportPage", () => {
  it("sends the code parsed from a pasted short link, then confirms", async () => {
    const user = userEvent.setup();
    let received: unknown = null;
    server.use(
      http.post(`${API}/api/reports`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ received: true }, { status: 201 });
      }),
    );
    renderPage();
    const submit = await readyToSend();

    await user.type(
      screen.getByLabelText("Short link or code"),
      `https://qr-tracker.example.workers.dev/r/${SLUG}`,
    );
    await user.click(screen.getByRole("radio", { name: /Phishing or scam/ }));
    await user.type(screen.getByLabelText(/Details/), "  Fake bank login  ");
    await user.click(submit);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("your report was sent");
    expect(status).toHaveFocus();
    expect(received).toEqual({
      slug: SLUG,
      reason: "phishing",
      details: "Fake bank login",
      turnstileToken: "test-token",
    });

    // "Report another" brings back an empty form.
    await user.click(screen.getByRole("button", { name: "Report another QR code" }));
    expect(screen.getByLabelText("Short link or code")).toHaveValue("");
  });

  it("prefills the code from the URL and omits empty details", async () => {
    const user = userEvent.setup();
    let received: Record<string, unknown> = {};
    server.use(
      http.post(`${API}/api/reports`, async ({ request }) => {
        received = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ received: true }, { status: 201 });
      }),
    );
    renderPage(`/report?code=${SLUG}`);
    expect(screen.getByLabelText("Short link or code")).toHaveValue(SLUG);
    const submit = await readyToSend();

    await user.click(screen.getByRole("radio", { name: /Spam/ }));
    await user.click(submit);
    await screen.findByText(/your report was sent/);
    expect(received).not.toHaveProperty("details");
  });

  it("rejects input that is not a short link or code, without calling the API", async () => {
    const user = userEvent.setup();
    const posted = vi.fn();
    server.use(
      http.post(`${API}/api/reports`, () => {
        posted();
        return HttpResponse.json({ received: true }, { status: 201 });
      }),
    );
    renderPage();
    const submit = await readyToSend();
    await user.type(screen.getByLabelText("Short link or code"), "https://example.com/page");
    await user.click(screen.getByRole("radio", { name: /Something else/ }));
    await user.click(submit);

    expect(screen.getByRole("alert")).toHaveTextContent(/7-character code/);
    expect(posted).not.toHaveBeenCalled();
  });

  it("shows API errors and resets Turnstile for a new attempt", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/api/reports`, () =>
        HttpResponse.json(
          { error: { code: "NOT_FOUND", message: "Link not found" } },
          { status: 404 },
        ),
      ),
    );
    renderPage();
    const submit = await readyToSend();
    await user.type(screen.getByLabelText("Short link or code"), SLUG);
    await user.click(screen.getByRole("radio", { name: /Malware/ }));
    await user.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent("This link does not exist");
    expect(resetSpy).toHaveBeenCalled();
  });
});
