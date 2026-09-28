import type { TopEntry } from "@qr-tracker/shared";
import { geoEqualEarth, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { en } from "../i18n/en.js";
import { countryAlpha2ForFeature, countryName } from "../lib/countries.js";
import {
  IDENTITY_VIEW,
  isIdentity,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  pinch,
  wheelZoomFactor,
  zoomAt,
} from "../lib/map-view.js";
import type { MapView, Point } from "../lib/map-view.js";

export type CountryFeature = Feature<Geometry, { name?: string } | null>;

const VIEW_WIDTH = 960;
const BUTTON_ZOOM = 1.6;
const HINT_MS = 1500;

interface CountryShape {
  key: string;
  d: string;
  alpha2: string | null;
  name: string;
}

interface Tip {
  name: string;
  count: number;
  x: number;
  y: number;
}

/** Client coordinates → viewBox coordinates (the SVG keeps the viewBox aspect ratio). */
function clientToViewBox(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  height: number,
): Point {
  const rect = svg.getBoundingClientRect();
  const sx = rect.width > 0 ? VIEW_WIDTH / rect.width : 1;
  const sy = rect.height > 0 ? height / rect.height : 1;
  return [(clientX - rect.left) * sx, (clientY - rect.top) * sy];
}

export interface GeoMapProps {
  features: CountryFeature[];
  /** Top countries as returned by the stats API (alpha-2 codes). */
  entries: TopEntry[];
}

/**
 * Pannable, zoomable world choropleth. The SVG is aria-hidden: the Countries
 * table rendered next to it is its accessible alternative.
 */
export function GeoMap({ features, entries }: GeoMapProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const moved = useRef(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [view, setView] = useState<MapView>(IDENTITY_VIEW);
  const [tip, setTip] = useState<Tip | null>(null);
  const [wheelHint, setWheelHint] = useState(false);

  const { shapes, height } = useMemo(() => {
    const collection: FeatureCollection<Geometry, { name?: string } | null> = {
      type: "FeatureCollection",
      features,
    };
    const projection = geoEqualEarth().fitWidth(VIEW_WIDTH, collection);
    const path = geoPath(projection);
    const maxY = path.bounds(collection)[1][1];
    const list: CountryShape[] = [];
    features.forEach((feature, index) => {
      const d = path(feature);
      if (d === null) return;
      const rawName = feature.properties?.name;
      const alpha2 = countryAlpha2ForFeature(feature.id, rawName);
      list.push({
        key: feature.id === undefined ? `feature-${index}` : String(feature.id),
        d,
        alpha2,
        name: alpha2 === null ? (rawName ?? "") : countryName(alpha2),
      });
    });
    return { shapes: list, height: Number.isFinite(maxY) ? Math.ceil(maxY) : VIEW_WIDTH / 2 };
  }, [features]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (entry.value === null) continue;
      const code = entry.value.toUpperCase();
      map.set(code, (map.get(code) ?? 0) + entry.count);
    }
    return map;
  }, [entries]);

  const shapeByKey = useMemo(() => new Map(shapes.map((shape) => [shape.key, shape])), [shapes]);

  // Memoized: the tooltip re-renders on every pointer move.
  const paths = useMemo(() => {
    const max = Math.max(0, ...counts.values());
    return shapes.map((shape) => {
      const count = shape.alpha2 === null ? 0 : (counts.get(shape.alpha2) ?? 0);
      return (
        <path
          key={shape.key}
          d={shape.d}
          data-key={shape.key}
          className={count > 0 ? "has-scans" : undefined}
          fillOpacity={count > 0 ? 0.35 + 0.65 * (count / max) : undefined}
        />
      );
    });
  }, [shapes, counts]);

  // Wheel zoom needs a non-passive listener (React registers wheel as passive).
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        // Plain scrolling keeps scrolling the page; explain how to zoom instead.
        setWheelHint(true);
        if (hintTimer.current !== null) clearTimeout(hintTimer.current);
        hintTimer.current = setTimeout(() => {
          setWheelHint(false);
        }, HINT_MS);
        return;
      }
      event.preventDefault();
      const at = clientToViewBox(svg, event.clientX, event.clientY, height);
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode);
      setView((current) => zoomAt(current, factor, at, VIEW_WIDTH, height));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
    };
  }, [height]);

  useEffect(
    () => () => {
      if (hintTimer.current !== null) clearTimeout(hintTimer.current);
    },
    [],
  );

  function toViewBox(clientX: number, clientY: number): Point {
    const svg = svgRef.current;
    return svg === null ? [clientX, clientY] : clientToViewBox(svg, clientX, clientY, height);
  }

  function showTip(target: EventTarget, clientX: number, clientY: number) {
    const key = target instanceof Element ? target.getAttribute("data-key") : null;
    const shape = key === null ? undefined : shapeByKey.get(key);
    const box = boxRef.current;
    if (shape === undefined || box === null) {
      setTip(null);
      return;
    }
    const rect = box.getBoundingClientRect();
    setTip({
      name: shape.name,
      count: shape.alpha2 === null ? 0 : (counts.get(shape.alpha2) ?? 0),
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.current.set(event.pointerId, toViewBox(event.clientX, event.clientY));
    moved.current = false;
    try {
      // Keeps receiving moves when a drag leaves the map.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is only a comfort: unsupported environments (jsdom) still pan while inside.
    }
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (previous === undefined || (pointers.current.size === 1 && view.k === MIN_ZOOM)) {
      // Hovering, or pressing on an unzoomed map (nothing to pan): show the country.
      showTip(event.target, event.clientX, event.clientY);
      return;
    }
    const next = toViewBox(event.clientX, event.clientY);
    const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId);
    pointers.current.set(event.pointerId, next);
    moved.current = true;
    setTip(null);
    if (other === undefined) {
      setView((current) =>
        panBy(current, next[0] - previous[0], next[1] - previous[1], VIEW_WIDTH, height),
      );
    } else {
      const anchor = other[1];
      setView((current) => pinch(current, [previous, anchor], [next, anchor], VIEW_WIDTH, height));
    }
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const tapped = !moved.current && pointers.current.size === 1;
    pointers.current.delete(event.pointerId);
    // Touch has no hover: a tap on a country shows its tooltip.
    if (tapped && event.pointerType !== "mouse") {
      showTip(event.target, event.clientX, event.clientY);
    }
  }

  function onPointerCancel(event: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
  }

  const center: Point = [VIEW_WIDTH / 2, height / 2];
  const zoomed = view.k > MIN_ZOOM;

  return (
    <div ref={boxRef} className={zoomed ? "geo-map is-zoomed" : "geo-map"}>
      <svg
        ref={svgRef}
        className="geo-map-svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        aria-hidden="true"
        style={{ touchAction: zoomed ? "none" : "pan-x pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => {
          setTip(null);
        }}
        onDoubleClick={(event) => {
          const at = toViewBox(event.clientX, event.clientY);
          setView((current) => zoomAt(current, 2, at, VIEW_WIDTH, height));
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>{paths}</g>
      </svg>

      <div className="map-controls">
        <button
          type="button"
          aria-label={en.stats.map.zoomIn}
          title={en.stats.map.zoomIn}
          disabled={view.k >= MAX_ZOOM}
          onClick={() => {
            setView((current) => zoomAt(current, BUTTON_ZOOM, center, VIEW_WIDTH, height));
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label={en.stats.map.zoomOut}
          title={en.stats.map.zoomOut}
          disabled={!zoomed}
          onClick={() => {
            setView((current) => zoomAt(current, 1 / BUTTON_ZOOM, center, VIEW_WIDTH, height));
          }}
        >
          −
        </button>
        <button
          type="button"
          aria-label={en.stats.map.reset}
          title={en.stats.map.reset}
          disabled={isIdentity(view)}
          onClick={() => {
            setView(IDENTITY_VIEW);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </div>

      {tip !== null && (
        <div
          className={tip.y < 48 ? "map-tooltip below" : "map-tooltip"}
          style={{ left: tip.x, top: tip.y }}
          aria-hidden="true"
        >
          <strong>{tip.name}</strong> · {en.stats.tops.scanCount(tip.count)}
        </div>
      )}
      {wheelHint && (
        <div className="map-wheel-hint" aria-hidden="true">
          {en.stats.map.wheelHint}
        </div>
      )}
    </div>
  );
}
