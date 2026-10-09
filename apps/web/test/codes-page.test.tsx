import type { LinkSummariesRequest, LinkSummary } from "@qr-tracker/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveCode, loadCodes } from "../src/lib/storage.js";
import { CodesPage } from "../src/pages/CodesPage.js";

import { KEY, server } from "./msw.js";

const API = "http://localhost:8787";

function seed(slug: string, label: string | null = null): void {
  saveCode({ slug, label, secretKey: KEY, createdAt: "2026-09-20T10:00:00.000Z" });
}

/** Answers every summary request; `bySlug` overrides the default "active, no scans". */
function mockSummaries(bySlug: Record<string, LinkSummary> = {}) {
  const seen: LinkSummariesRequest[] = [];
  server.use(
    http.post(`${API}/api/links/summaries`, async ({ request }) => {
      const body = (await request.json()) as LinkSummariesRequest;
      seen.push(body);
      return HttpResponse.json({
        summaries: body.links.map(
          ({ slug }): LinkSummary =>
            bySlug[slug] ?? { ok: true, slug, status: "active", scans: 0, lastScanAt: null },
        ),
      });
    }),
  );
  return seen;
}

function renderPage(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/codes", state }]}>
      <CodesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockSummaries();
});

describe("CodesPage", () => {
  it("shows an empty state", () => {
    renderPage();
    expect(screen.getByText(/No QR codes saved/)).toBeInTheDocument();
  });

  it("lists stored codes with a stats link carrying the key in the route", async () => {
    seed("aaaaaaa", "Poster B");
    renderPage();
    expect(screen.getByText("Poster B")).toBeInTheDocument();
    // MemoryRouter renders plain hrefs; in production HashRouter prefixes "#".
    const link = screen.getByRole("link", { name: "Statistics" });
    expect(link).toHaveAttribute("href", `/stats/aaaaaaa/${KEY}`);
    // Let the summary request settle so it cannot leak into the next test.
    expect(await screen.findByText("Never")).toBeInTheDocument();
  });

  it("shows each code's scans, last scan and status, with its own key", async () => {
    seed("aaaaaaa", "Poster B");
    seed("bbbbbbb", "Flyer C");
    seed("ccccccc", "Old sticker");
    seed("ddddddd", "Rotated");
    const seen = mockSummaries({
      aaaaaaa: {
        ok: true,
        slug: "aaaaaaa",
        status: "active",
        scans: 128,
        lastScanAt: "2026-10-01T09:00:00.000Z",
      },
      bbbbbbb: { ok: true, slug: "bbbbbbb", status: "disabled", scans: 0, lastScanAt: null },
      ccccccc: { ok: false, slug: "ccccccc", error: "NOT_FOUND" },
      ddddddd: { ok: false, slug: "ddddddd", error: "UNAUTHORIZED" },
    });
    renderPage();

    const poster = (await screen.findByText("128")).closest("tr");
    expect(poster).not.toBeNull();
    if (poster === null) return;
    expect(within(poster).getByText("Poster B")).toBeInTheDocument();
    expect(
      within(poster).getByText(
        new Date("2026-10-01T09:00:00.000Z").toLocaleDateString(undefined, { dateStyle: "medium" }),
      ),
    ).toBeInTheDocument();

    const flyer = screen.getByText("Flyer C").closest("tr");
    if (flyer === null) throw new Error("missing row");
    expect(within(flyer).getByText("Disabled")).toBeInTheDocument();
    expect(within(flyer).getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
    expect(screen.getByText("Key not valid")).toBeInTheDocument();

    // One request for the whole list, each code with its key.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.links).toContainEqual({ slug: "aaaaaaa", secretKey: KEY });
  });

  it("offers to retry when the scan counts cannot be loaded", async () => {
    seed("aaaaaaa", "Poster B");
    mockSummaries({
      aaaaaaa: { ok: true, slug: "aaaaaaa", status: "active", scans: 7, lastScanAt: null },
    });
    // Handlers added later take precedence: the first request fails, the retry succeeds.
    server.use(http.post(`${API}/api/links/summaries`, () => HttpResponse.error(), { once: true }));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("confirms a deletion made from the dashboard", () => {
    renderPage({ deleted: true });
    expect(screen.getByRole("status")).toHaveTextContent("QR code deleted.");
  });

  it("removes a code after confirmation", async () => {
    seed("aaaaaaa");
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await screen.findByText("Never");
    await user.click(screen.getByRole("button", { name: "Remove from list" }));
    expect(loadCodes()).toHaveLength(0);
    expect(screen.getByText(/No QR codes saved/)).toBeInTheDocument();
  });

  it("imports a JSON backup", async () => {
    const user = userEvent.setup();
    renderPage();
    const payload = JSON.stringify({
      version: 1,
      items: [
        {
          slug: "bbbbbbb",
          label: "Imported",
          secretKey: KEY,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    const file = new File([payload], "backup.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Import (JSON)"), file);

    expect(await screen.findByText("1 QR code imported.")).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(await screen.findByText("Never")).toBeInTheDocument();
  });

  it("reports invalid import files", async () => {
    const user = userEvent.setup();
    renderPage();
    const file = new File(["{broken"], "bad.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Import (JSON)"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid file");
  });
});
