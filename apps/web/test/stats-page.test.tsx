import type { Link } from "@qr-tracker/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { loadCodes, saveCode } from "../src/lib/storage.js";
import { StatsPage } from "../src/pages/StatsPage.js";

import { KEY, makeStats, server, SLUG } from "./msw.js";

// jsdom has no canvas: replace the lazy Chart.js canvas with a placeholder.
// The accessible <table> alternatives are what the tests (and WCAG) rely on.
vi.mock("../src/components/ChartCanvas.js", () => ({
  default: () => <div data-testid="chart-canvas" />,
}));

const API = "http://localhost:8787";

function makeLink(overrides: Partial<Link> = {}): Link {
  return {
    slug: SLUG,
    targetUrl: "https://example.org/page",
    label: "Poster B",
    status: "active",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockApi(link = makeLink(), stats = makeStats()) {
  const seen: { statsUrls: string[] } = { statsUrls: [] };
  server.use(
    http.get(`${API}/api/links/${SLUG}`, () => HttpResponse.json(link)),
    http.get(`${API}/api/links/${SLUG}/stats`, ({ request }) => {
      seen.statsUrls.push(request.url);
      return HttpResponse.json(stats);
    }),
  );
  return seen;
}

function renderPage(slug = SLUG, key = KEY) {
  return render(
    <MemoryRouter initialEntries={[`/stats/${slug}/${key}`]}>
      <Routes>
        <Route path="/stats/:slug/:key" element={<StatsPage />} />
        <Route path="/codes" element={<p>codes-page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StatsPage", () => {
  it("renders totals, charts with table alternatives, and top lists", async () => {
    mockApi();
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /Statistics — Poster B/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();

    // Charts (mocked canvas) each pair with an accessible data table.
    expect((await screen.findAllByTestId("chart-canvas")).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Chart data as a table").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("heading", { name: "Scans per day" })).toBeInTheDocument();

    // Tops: unknown values are localized, device types translated.
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
    expect(screen.getByText("Orange")).toBeInTheDocument();
  });

  it("refetches with includeBots=true when the toggle is checked", async () => {
    const seen = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("42");

    await user.click(screen.getByRole("checkbox", { name: /Include bots/ }));
    await waitFor(() => {
      expect(seen.statsUrls.some((u) => u.includes("includeBots=true"))).toBe(true);
    });
  });

  it("applies quick date ranges", async () => {
    const seen = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("42");

    await user.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => {
      expect(seen.statsUrls.some((u) => u.includes("from=") && u.includes("to="))).toBe(true);
    });
  });

  it("shows a friendly error for a wrong key", async () => {
    server.use(
      http.get(`${API}/api/links/${SLUG}`, () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Invalid secret key" } },
          { status: 401 },
        ),
      ),
      http.get(`${API}/api/links/${SLUG}/stats`, () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Invalid secret key" } },
          { status: 401 },
        ),
      ),
    );
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid secret key");
  });

  it("rejects malformed route params without calling the API", () => {
    renderPage("bad", "short");
    expect(screen.getByRole("alert")).toHaveTextContent("Badly formatted");
  });

  it("updates the destination from the manage panel", async () => {
    mockApi();
    const user = userEvent.setup();
    server.use(
      http.patch(`${API}/api/links/${SLUG}`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.targetUrl).toBe("https://updated.example.org/x");
        return HttpResponse.json(makeLink({ targetUrl: "https://updated.example.org/x" }));
      }),
    );
    renderPage();
    await screen.findByText("42");

    const input = screen.getByLabelText("Destination address");
    await user.clear(input);
    await user.type(input, "https://updated.example.org/x");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Destination updated.");
  });

  it("toggles the disabled status and shows the badge", async () => {
    mockApi();
    const user = userEvent.setup();
    server.use(
      http.patch(`${API}/api/links/${SLUG}`, () =>
        HttpResponse.json(makeLink({ status: "disabled" })),
      ),
    );
    renderPage();
    await screen.findByText("42");

    await user.click(screen.getByRole("button", { name: "Disable link" }));
    expect(await screen.findByText("Disabled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-enable link" })).toBeInTheDocument();
  });

  it("hides editing for admin-blocked links but keeps delete", async () => {
    mockApi(makeLink({ status: "blocked" }));
    renderPage();
    await screen.findByText("42");

    expect(screen.getByText("Blocked by the administrator")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete permanently" })).toBeInTheDocument();
  });

  it("deletes the link, removes it from the local list and navigates away", async () => {
    saveCode({ slug: SLUG, label: null, secretKey: KEY, createdAt: "2026-09-01T00:00:00.000Z" });
    mockApi();
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    server.use(
      http.delete(`${API}/api/links/${SLUG}`, () => new HttpResponse(null, { status: 204 })),
    );
    renderPage();
    await screen.findByText("42");

    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(await screen.findByText("codes-page")).toBeInTheDocument();
    expect(loadCodes()).toHaveLength(0);
  });

  it("shows the empty state when there are no scans", async () => {
    mockApi(
      makeLink(),
      makeStats({
        totals: { scans: 0, uniqueVisitors: 0, firstScanAt: null, lastScanAt: null },
        byDay: [],
      }),
    );
    renderPage();
    expect(await screen.findByText("No scans in this period.")).toBeInTheDocument();
  });
});
