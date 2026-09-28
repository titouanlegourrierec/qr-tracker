import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GeoMap } from "../src/components/GeoMap.js";
import type { CountryFeature } from "../src/components/GeoMap.js";

/** A small clockwise square (d3-geo winding) around lon/lat. */
function square(id: string, name: string, lon: number, lat: number): CountryFeature {
  return {
    type: "Feature",
    id,
    properties: { name },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lon, lat],
          [lon, lat + 10],
          [lon + 10, lat + 10],
          [lon + 10, lat],
          [lon, lat],
        ],
      ],
    },
  };
}

const FEATURES = [square("250", "France", 0, 40), square("840", "USA", -100, 30)];
const ENTRIES = [
  { value: "FR", count: 14 },
  { value: null, count: 3 },
];

function renderMap() {
  const { container } = render(<GeoMap features={FEATURES} entries={ENTRIES} />);
  const svg = container.querySelector("svg.geo-map-svg");
  const group = container.querySelector("svg.geo-map-svg > g");
  if (!(svg instanceof SVGSVGElement) || group === null) throw new Error("map not rendered");
  const path = (key: string) => {
    const el = container.querySelector(`path[data-key="${key}"]`);
    if (el === null) throw new Error(`no path ${key}`);
    return el;
  };
  const scale = () => Number(/scale\(([\d.]+)\)/.exec(group.getAttribute("transform") ?? "")?.[1]);
  return { svg, group, path, scale };
}

describe("GeoMap", () => {
  it("draws one shape per country and shades those with scans", () => {
    const { path } = renderMap();
    expect(path("250")).toHaveClass("has-scans");
    expect(path("250")).toHaveAttribute("fill-opacity", "1");
    expect(path("840")).not.toHaveClass("has-scans");
  });

  it("shows the country name and its scans on hover", () => {
    const { svg, path } = renderMap();
    fireEvent.pointerMove(path("250"), { clientX: 10, clientY: 80 });
    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.getByText(/14 scans/)).toBeInTheDocument();

    fireEvent.pointerMove(path("840"), { clientX: 10, clientY: 20 });
    expect(screen.getByText("United States")).toBeInTheDocument();
    expect(screen.getByText(/0 scans/)).toBeInTheDocument();

    fireEvent.pointerLeave(svg);
    expect(screen.queryByText("United States")).not.toBeInTheDocument();
  });

  it("zooms with the buttons and resets", () => {
    const { scale } = renderMap();
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const reset = screen.getByRole("button", { name: "Reset map view" });
    expect(zoomOut).toBeDisabled();
    expect(reset).toBeDisabled();

    fireEvent.click(zoomIn);
    expect(scale()).toBeCloseTo(1.6);
    expect(reset).toBeEnabled();

    fireEvent.click(zoomOut);
    expect(scale()).toBe(1);

    fireEvent.click(zoomIn);
    fireEvent.click(reset);
    expect(scale()).toBe(1);
  });

  it("zooms with Ctrl + wheel and hints when scrolling without it", () => {
    const { svg, scale } = renderMap();
    fireEvent.wheel(svg, { deltaY: 40, clientX: 100, clientY: 100 });
    expect(screen.getByText(/Hold Ctrl/)).toBeInTheDocument();
    expect(scale()).toBe(1);

    fireEvent.wheel(svg, { deltaY: -100, ctrlKey: true, clientX: 100, clientY: 100 });
    expect(scale()).toBeCloseTo(Math.exp(0.5));
  });

  it("zooms in on double-click and pans by dragging once zoomed", () => {
    const { svg, group, scale } = renderMap();
    fireEvent.doubleClick(svg, { clientX: 480, clientY: 100 });
    expect(scale()).toBe(2);

    const before = group.getAttribute("transform");
    fireEvent.pointerDown(svg, { pointerId: 1, clientX: 400, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 380, clientY: 90 });
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 380, clientY: 90 });
    expect(group.getAttribute("transform")).not.toBe(before);
    expect(scale()).toBe(2);
  });

  it("pinch-zooms with two pointers", () => {
    const { svg, scale } = renderMap();
    fireEvent.pointerDown(svg, { pointerId: 1, pointerType: "touch", clientX: 400, clientY: 100 });
    fireEvent.pointerDown(svg, { pointerId: 2, pointerType: "touch", clientX: 500, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 2, pointerType: "touch", clientX: 600, clientY: 100 });
    expect(scale()).toBe(2);
  });

  it("shows the tooltip when a country is tapped", () => {
    const { path } = renderMap();
    fireEvent.pointerDown(path("250"), { pointerId: 7, pointerType: "touch", clientX: 5 });
    fireEvent.pointerUp(path("250"), { pointerId: 7, pointerType: "touch", clientX: 5 });
    expect(screen.getByText("France")).toBeInTheDocument();
  });
});
