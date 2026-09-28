import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "./msw.js";

const TOPOLOGY_URL = /countries-110m\.json/;

/** Minimal unquantized TopoJSON: France plus Antarctica (which the loader hides). */
const TOPOLOGY = {
  type: "Topology",
  arcs: [
    [
      [0, 40],
      [0, 50],
      [10, 50],
      [10, 40],
      [0, 40],
    ],
    [
      [0, -80],
      [0, -70],
      [10, -70],
      [10, -80],
      [0, -80],
    ],
  ],
  objects: {
    countries: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", arcs: [[0]], id: "250", properties: { name: "France" } },
        { type: "Polygon", arcs: [[1]], id: "010", properties: { name: "Antarctica" } },
      ],
    },
  },
};

// The loader caches the topology per page load: re-import it fresh per test.
async function renderLoader() {
  const { default: GeoMapLoader } = await import("../src/components/GeoMapLoader.js");
  return render(<GeoMapLoader entries={[{ value: "FR", count: 2 }]} />);
}

beforeEach(() => {
  vi.resetModules();
});

describe("GeoMapLoader", () => {
  it("loads the world topology and renders the map without Antarctica", async () => {
    server.use(http.get(TOPOLOGY_URL, () => HttpResponse.json(TOPOLOGY)));
    const { container } = await renderLoader();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector('path[data-key="250"]')).not.toBeNull();
    });
    expect(container.querySelector('path[data-key="010"]')).toBeNull();
  });

  it("shows a message when the topology cannot be loaded", async () => {
    server.use(http.get(TOPOLOGY_URL, () => new HttpResponse(null, { status: 503 })));
    await renderLoader();
    expect(await screen.findByText("The map could not be loaded.")).toBeInTheDocument();
  });

  it("rejects a topology without a countries collection", async () => {
    server.use(
      http.get(TOPOLOGY_URL, () => HttpResponse.json({ type: "Topology", arcs: [], objects: {} })),
    );
    await renderLoader();
    expect(await screen.findByText("The map could not be loaded.")).toBeInTheDocument();
  });
});
