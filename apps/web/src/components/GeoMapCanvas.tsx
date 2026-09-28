import type { TopEntry } from "@qr-tracker/shared";
import { Chart, Tooltip } from "chart.js";
import {
  ChoroplethController,
  ColorScale,
  GeoFeature,
  ProjectionScale,
  topojson,
} from "chartjs-chart-geo";
import { useEffect, useRef, useState } from "react";
import worldUrl from "world-atlas/countries-110m.json?url";

import { en } from "../i18n/en.js";
import { countryNumericId } from "../lib/countries.js";

Chart.register(ChoroplethController, GeoFeature, ColorScale, ProjectionScale, Tooltip);

type WorldTopology = Parameters<typeof topojson.feature>[0];
type WorldFeature =
  ReturnType<typeof topojson.feature> extends infer R
    ? R extends { features: (infer F)[] }
      ? F
      : never
    : never;

// The 110m topology is fetched once (same-origin asset: CSP connect-src 'self')
// and shared across dashboard visits. Microstates are absent at this
// resolution; the Countries list next to the map remains the canonical data.
let worldFeaturesPromise: Promise<WorldFeature[]> | null = null;

function loadWorldFeatures(): Promise<WorldFeature[]> {
  worldFeaturesPromise ??= fetch(worldUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`world topology: HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      const world = json as WorldTopology;
      const countries = world.objects.countries;
      if (countries === undefined) throw new Error("world topology: no countries object");
      const collection = topojson.feature(world, countries);
      if (!("features" in collection)) throw new Error("world topology: not a collection");
      return collection.features;
    })
    .catch((err: unknown) => {
      worldFeaturesPromise = null; // allow a retry on the next mount
      throw err instanceof Error ? err : new Error(String(err));
    });
  return worldFeaturesPromise;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Accent color with an alpha in [0,1], as an 8-digit hex (canvas-safe). */
function accentWithAlpha(accent: string, alpha: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${accent}${byte}`;
}

export interface GeoMapCanvasProps {
  /** Top countries as returned by the stats API (alpha-2 codes). */
  entries: TopEntry[];
}

/**
 * World choropleth of scans per country. The canvas is aria-hidden: the
 * Countries table rendered beside the map is its accessible alternative.
 */
export default function GeoMapCanvas({ entries }: GeoMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [features, setFeatures] = useState<WorldFeature[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadWorldFeatures()
      .then((loaded) => {
        if (!cancelled) setFeatures(loaded);
      })
      .catch(() => {
        // Map stays blank; the Countries list still carries the data.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || features === null) return;

    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.value === null) continue;
      const id = countryNumericId(entry.value);
      if (id !== null) counts.set(id, (counts.get(id) ?? 0) + entry.count);
    }

    const accent = cssVar("--accent") || "#4f46e5";
    const neutral = cssVar("--chart-grid") || "#eceff3";
    const border = cssVar("--border") || "#e4e7ec";

    const chart = new Chart(canvas, {
      type: "choropleth",
      data: {
        labels: features.map((f) => {
          const props = f.properties as { name?: string } | null;
          return props?.name ?? String(f.id ?? "");
        }),
        datasets: [
          {
            outline: features,
            showOutline: false,
            borderColor: border,
            borderWidth: 0.6,
            data: features.map((f) => ({
              feature: f,
              value: counts.get(String(f.id ?? "").padStart(3, "0")) ?? 0,
            })),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (item) => {
                // Chart.js types `raw` as unknown; choropleth points are {feature, value}.
                const value = (item.raw as { value?: number }).value ?? 0;
                return `${item.label}: ${en.stats.tops.scanCount(value)}`;
              },
            },
          },
        },
        scales: {
          projection: { axis: "x", projection: "equalEarth" },
          color: {
            axis: "x",
            display: false,
            // 0 scans renders as neutral land; anything above starts clearly
            // visible so a 1-scan country is not invisible next to a big one.
            interpolate: (t: number) =>
              t <= 0 ? neutral : accentWithAlpha(accent, 0.35 + 0.65 * t),
            missing: neutral,
          },
        },
      },
    });
    return () => {
      chart.destroy();
    };
  }, [features, entries]);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
