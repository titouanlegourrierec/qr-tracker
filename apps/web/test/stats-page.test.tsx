import type { Link } from "@qr-tracker/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, NavLink, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { loadCodes, saveCode } from "../src/lib/storage.js";
import { CodesPage } from "../src/pages/CodesPage.js";
import { StatsPage } from "../src/pages/StatsPage.js";

import { KEY, makeStats, server, SLUG } from "./msw.js";

// jsdom has no canvas: replace the lazy Chart.js canvas with a placeholder.
// The accessible <table> alternatives are what the tests (and WCAG) rely on.
vi.mock("../src/components/ChartCanvas.js", () => ({
  default: () => <div data-testid="chart-canvas" />,
}));
// The map loader fetches the world topology; the map itself has its own tests.
vi.mock("../src/components/GeoMapLoader.js", () => ({
  default: () => <div data-testid="geo-map" />,
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
    access: "owner",
    hasViewKey: false,
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
        <Route path="/codes" element={<CodesPage />} />
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

    // Tops: unknown values localized; country codes, languages and device
    // types shown as display names.
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Mobile")).toBeInTheDocument();
    expect(screen.getByText("France")).toBeInTheDocument();
    // Homonym cities are told apart by their country.
    expect(screen.getByRole("rowheader", { name: "Paris, France" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Paris, United States" })).toBeInTheDocument();
    expect(screen.getByText("French")).toBeInTheDocument();

    // The map section renders (mocked canvas) with its hint.
    expect(screen.getByTestId("geo-map")).toBeInTheDocument();
    expect(screen.getByText(/shaded by number of scans/)).toBeInTheDocument();
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

  it("removes a date bound when its field is emptied", async () => {
    const seen = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("42");

    await user.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => {
      expect(seen.statsUrls.at(-1)).toContain("from=");
    });
    await user.clear(screen.getByLabelText("From"));
    await user.clear(screen.getByLabelText("To"));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      const last = seen.statsUrls.at(-1) ?? "";
      expect(last).not.toContain("from=");
      expect(last).not.toContain("to=");
    });
    expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("ignores a slow response for filters that were changed since", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API}/api/links/${SLUG}`, () => HttpResponse.json(makeLink())),
      http.get(`${API}/api/links/${SLUG}/stats`, async ({ request }) => {
        const url = request.url;
        if (url.includes("from=") && !url.includes("includeBots=true")) {
          // "7 days" answers last, after the newer "7 days + bots" request.
          await delay(300);
          return HttpResponse.json(makeStats({ totals: { ...makeStats().totals, scans: 707 } }));
        }
        const scans = url.includes("includeBots=true") ? 999 : 42;
        return HttpResponse.json(makeStats({ totals: { ...makeStats().totals, scans } }));
      }),
    );
    renderPage();
    await screen.findByText("42");

    await user.click(screen.getByRole("button", { name: "7 days" }));
    await user.click(screen.getByRole("checkbox", { name: /Include bots/ }));
    expect(await screen.findByText("999")).toBeInTheDocument();

    // Let the slow "7 days" response arrive: it must not replace the newer numbers.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByText("999")).toBeInTheDocument();
    expect(screen.queryByText("707")).not.toBeInTheDocument();
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

  it("loads again with Retry after a failure", async () => {
    mockApi();
    server.use(
      http.get(`${API}/api/links/${SLUG}/stats`, () => HttpResponse.error(), { once: true }),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains how visitors are counted and which time zone is used", async () => {
    mockApi();
    renderPage();
    await screen.findByText("42");
    expect(screen.getByText("Visitors (unique per day)")).toBeInTheDocument();
    expect(screen.getByText(/counts as three visitors/)).toBeInTheDocument();
    expect(screen.getByText(/browser's time zone \(Europe\/Paris\)/)).toBeInTheDocument();
  });

  it("exports the CSV for the dashboard's days, and reports export errors apart", async () => {
    mockApi();
    const exportUrls: string[] = [];
    server.use(
      http.get(`${API}/api/links/${SLUG}/export`, ({ request }) => {
        exportUrls.push(request.url);
        return HttpResponse.json(
          { error: { code: "RATE_LIMITED", message: "Too many requests" } },
          { status: 429 },
        );
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("42");

    await user.click(screen.getByRole("button", { name: "7 days" }));
    await user.click(screen.getByRole("button", { name: "Export scans (CSV)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests");
    const url = new URL(exportUrls[0] ?? "");
    expect(url.searchParams.get("tz")).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(url.searchParams.get("from")).not.toBeNull();
    // The dashboard itself stays usable: an export failure offers no "Retry" of the stats.
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
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

  it("shows the destination as normalized by the worker after saving", async () => {
    mockApi();
    const user = userEvent.setup();
    server.use(
      http.patch(`${API}/api/links/${SLUG}`, () =>
        HttpResponse.json(makeLink({ targetUrl: "https://updated.example.org/" })),
      ),
    );
    renderPage();
    await screen.findByText("42");

    const input = screen.getByLabelText("Destination address");
    await user.clear(input);
    await user.type(input, "https://updated.example.org");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("status");
    expect(input).toHaveValue("https://updated.example.org/");
  });

  it("starts from a clean slate when another link's private URL is opened", async () => {
    const otherSlug = "Zz9yX8w";
    const otherKey = "o".repeat(43);
    mockApi();
    server.use(
      http.get(`${API}/api/links/${otherSlug}`, () =>
        HttpResponse.json(
          makeLink({ slug: otherSlug, label: "Flyer C", targetUrl: "https://other.example/c" }),
        ),
      ),
      http.get(`${API}/api/links/${otherSlug}/stats`, () => HttpResponse.json(makeStats())),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/stats/${SLUG}/${KEY}`]}>
        {/* Stands in for a bookmark: only the URL fragment changes. */}
        <NavLink to={`/stats/${otherSlug}/${otherKey}`}>open other</NavLink>
        <Routes>
          <Route path="/stats/:slug/:key" element={<StatsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: /Poster B/ });
    await user.click(screen.getByRole("button", { name: "7 days" }));
    await user.type(screen.getByLabelText("Destination address"), "-typed-for-B");

    await user.click(screen.getByRole("link", { name: "open other" }));

    expect(await screen.findByRole("heading", { name: /Flyer C/ })).toBeInTheDocument();
    // The edit field shows this link's destination, not the previous link's draft…
    expect(screen.getByLabelText("Destination address")).toHaveValue("https://other.example/c");
    // …and the filters are back to their defaults.
    expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
    expect(await screen.findByRole("heading", { name: "My QR codes" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("QR code deleted.");
    expect(loadCodes()).toHaveLength(0);
  });

  it("shows a read-only view to viewers, without the manage panel", async () => {
    mockApi(makeLink({ access: "viewer", hasViewKey: true }));
    renderPage();
    await screen.findByText("42");
    expect(screen.getByText("Read-only view")).toBeInTheDocument();
    expect(screen.getByText(/shared its statistics with you/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Manage this QR code" })).not.toBeInTheDocument();
    // Viewers can still export.
    expect(screen.getByRole("button", { name: "Export scans (CSV)" })).toBeInTheDocument();
  });

  it("creates a read-only link, keeps it in My QR codes, and revokes it", async () => {
    saveCode({ slug: SLUG, label: null, secretKey: KEY, createdAt: "2026-09-01T00:00:00.000Z" });
    const viewKey = "v".repeat(43);
    mockApi();
    server.use(
      http.post(`${API}/api/links/${SLUG}/view-key`, ({ request }) => {
        expect(request.headers.get("Authorization")).toBe(`Bearer ${KEY}`);
        return HttpResponse.json({ viewKey }, { status: 201 });
      }),
      http.delete(
        `${API}/api/links/${SLUG}/view-key`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("42");

    await user.click(screen.getByRole("button", { name: "Create a read-only link" }));
    expect(await screen.findByText(/Read-only link created/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`#/stats/${SLUG}/${viewKey}$`))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy read-only link" })).toBeInTheDocument();
    expect(loadCodes()[0]?.viewKey).toBe(viewKey);

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByText(/Read-only link revoked/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(viewKey))).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create a read-only link" })).toBeInTheDocument();
    expect(loadCodes()[0]?.viewKey).toBeUndefined();
  });

  it("says when a read-only link exists but this browser has no copy", async () => {
    mockApi(makeLink({ hasViewKey: true }));
    renderPage();
    await screen.findByText("42");
    expect(screen.getByText(/this browser has no copy of it/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace the read-only link" })).toBeInTheDocument();
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
