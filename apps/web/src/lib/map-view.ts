/**
 * Pan/zoom state of the world map, applied as an SVG transform:
 * screen point = (x, y) + k · map point, in viewBox units. Pure functions so
 * the gesture math is unit-tested independently of the DOM.
 */
export interface MapView {
  k: number;
  x: number;
  y: number;
}

export type Point = readonly [number, number];

export const IDENTITY_VIEW: MapView = { k: 1, x: 0, y: 0 };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

function clampZoom(k: number): number {
  // Rounded so that zooming in then out lands exactly back on 1 (no float drift).
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k)) * 1e6) / 1e6;
}

/** Keeps the zoom within bounds and the map covering the whole viewport. */
export function clampView(view: MapView, width: number, height: number): MapView {
  const k = clampZoom(view.k);
  return {
    k,
    x: Math.min(0, Math.max(width * (1 - k), view.x)),
    y: Math.min(0, Math.max(height * (1 - k), view.y)),
  };
}

/** Zooms by `factor`, keeping the map point under `at` where it is on screen. */
export function zoomAt(
  view: MapView,
  factor: number,
  at: Point,
  width: number,
  height: number,
): MapView {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return clampView(
    { k, x: at[0] - ratio * (at[0] - view.x), y: at[1] - ratio * (at[1] - view.y) },
    width,
    height,
  );
}

export function panBy(
  view: MapView,
  dx: number,
  dy: number,
  width: number,
  height: number,
): MapView {
  return clampView({ k: view.k, x: view.x + dx, y: view.y + dy }, width, height);
}

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Two-finger gesture: zooms by the change in finger spacing around the
 * previous midpoint, then follows the midpoint as the fingers move.
 */
export function pinch(
  view: MapView,
  previous: readonly [Point, Point],
  next: readonly [Point, Point],
  width: number,
  height: number,
): MapView {
  const before = distance(previous[0], previous[1]);
  const after = distance(next[0], next[1]);
  const from = midpoint(previous[0], previous[1]);
  const to = midpoint(next[0], next[1]);
  const zoomed = before > 0 ? zoomAt(view, after / before, from, width, height) : view;
  return panBy(zoomed, to[0] - from[0], to[1] - from[1], width, height);
}

/**
 * Zoom factor for a wheel event. Line/page delta modes are converted to
 * pixels, and bursts are clamped so one mouse-wheel notch stays a gentle step.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-Math.max(-50, Math.min(50, pixels)) * 0.01);
}

export function isIdentity(view: MapView): boolean {
  return view.k === 1 && view.x === 0 && view.y === 0;
}
