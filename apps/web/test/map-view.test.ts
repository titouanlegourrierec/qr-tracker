import { describe, expect, it } from "vitest";

import {
  clampView,
  IDENTITY_VIEW,
  isIdentity,
  MAX_ZOOM,
  panBy,
  pinch,
  wheelZoomFactor,
  zoomAt,
} from "../src/lib/map-view.js";
import type { MapView, Point } from "../src/lib/map-view.js";

const W = 960;
const H = 480;

/** Screen position of a map point under a view. */
function project(view: MapView, p: Point): Point {
  return [view.x + view.k * p[0], view.y + view.k * p[1]];
}

describe("clampView", () => {
  it("bounds the zoom and snaps back to identity at k = 1", () => {
    expect(clampView({ k: 0.2, x: 50, y: -50 }, W, H)).toEqual(IDENTITY_VIEW);
    expect(clampView({ k: 100, x: 0, y: 0 }, W, H).k).toBe(MAX_ZOOM);
  });

  it("keeps the map covering the viewport", () => {
    expect(clampView({ k: 2, x: 10, y: 10 }, W, H)).toEqual({ k: 2, x: 0, y: 0 });
    expect(clampView({ k: 2, x: -5000, y: -5000 }, W, H)).toEqual({ k: 2, x: -W, y: -H });
  });
});

describe("zoomAt", () => {
  it("keeps the map point under the cursor fixed", () => {
    const at: Point = [300, 200];
    // At k = 1 the map point under the cursor is the cursor position itself.
    const once = zoomAt(IDENTITY_VIEW, 2, at, W, H);
    expect(once.k).toBe(2);
    expect(project(once, at)).toEqual(at);

    // From an already zoomed view, the point under a new cursor stays put too.
    const cursor: Point = [600, 300];
    const under: Point = [(cursor[0] - once.x) / once.k, (cursor[1] - once.y) / once.k];
    const twice = zoomAt(once, 1.5, cursor, W, H);
    expect(twice.k).toBe(3);
    const [sx, sy] = project(twice, under);
    expect(sx).toBeCloseTo(cursor[0]);
    expect(sy).toBeCloseTo(cursor[1]);
  });

  it("clamps at the zoom limits", () => {
    expect(zoomAt(IDENTITY_VIEW, 0.5, [100, 100], W, H)).toEqual(IDENTITY_VIEW);
    expect(zoomAt({ k: 7, x: 0, y: 0 }, 4, [0, 0], W, H).k).toBe(MAX_ZOOM);
  });
});

describe("panBy", () => {
  it("moves a zoomed map and stops at its edges", () => {
    const zoomed = zoomAt(IDENTITY_VIEW, 2, [W / 2, H / 2], W, H);
    expect(panBy(zoomed, 30, -20, W, H)).toEqual({ k: 2, x: zoomed.x + 30, y: zoomed.y - 20 });
    expect(panBy(zoomed, 10_000, 10_000, W, H)).toEqual({ k: 2, x: 0, y: 0 });
  });

  it("does nothing at k = 1", () => {
    expect(panBy(IDENTITY_VIEW, 40, 40, W, H)).toEqual(IDENTITY_VIEW);
  });
});

describe("pinch", () => {
  it("zooms by the change in finger spacing", () => {
    const view = pinch(
      IDENTITY_VIEW,
      [
        [400, 200],
        [500, 200],
      ],
      [
        [400, 200],
        [600, 200],
      ],
      W,
      H,
    );
    expect(view.k).toBe(2);
  });

  it("pans with the midpoint when the spacing is unchanged", () => {
    const zoomed = zoomAt(IDENTITY_VIEW, 2, [W / 2, H / 2], W, H);
    const view = pinch(
      zoomed,
      [
        [100, 100],
        [200, 100],
      ],
      [
        [120, 110],
        [220, 110],
      ],
      W,
      H,
    );
    expect(view).toEqual({ k: 2, x: zoomed.x + 20, y: zoomed.y + 10 });
  });

  it("ignores degenerate gestures", () => {
    const same: [Point, Point] = [
      [100, 100],
      [100, 100],
    ];
    expect(pinch(IDENTITY_VIEW, same, same, W, H)).toEqual(IDENTITY_VIEW);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in on scroll up and out on scroll down", () => {
    expect(wheelZoomFactor(-10, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(10, 0)).toBeLessThan(1);
  });

  it("normalizes line and page modes and clamps bursts", () => {
    expect(wheelZoomFactor(1, 1)).toBeCloseTo(wheelZoomFactor(16, 0));
    expect(wheelZoomFactor(1, 2)).toBeCloseTo(wheelZoomFactor(50, 0));
    expect(wheelZoomFactor(-1000, 0)).toBeCloseTo(Math.exp(0.5));
  });
});

describe("isIdentity", () => {
  it("detects the untouched view", () => {
    expect(isIdentity(IDENTITY_VIEW)).toBe(true);
    expect(isIdentity({ k: 2, x: 0, y: 0 })).toBe(false);
  });
});
