import type { TopEntry } from "@qr-tracker/shared";
import { useEffect, useState } from "react";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import worldUrl from "world-atlas/countries-110m.json?url";

import { en } from "../i18n/en.js";

import { GeoMap } from "./GeoMap.js";
import type { CountryFeature } from "./GeoMap.js";

/** Antarctica takes a wide band of the map and gets no scans in practice. */
const HIDDEN_FEATURE_IDS = new Set(["010"]);

// The 110m topology is a same-origin asset (CSP connect-src 'self'), fetched
// once per page load. Microstates are absent at this resolution; the
// Countries list next to the map remains the canonical data.
let worldPromise: Promise<CountryFeature[]> | null = null;

async function fetchWorld(): Promise<CountryFeature[]> {
  const res = await fetch(new URL(worldUrl, window.location.href));
  if (!res.ok) throw new Error(`world topology: HTTP ${res.status}`);
  const topology = (await res.json()) as Topology;
  const countries = topology.objects.countries;
  if (countries?.type !== "GeometryCollection") {
    throw new Error("world topology: no countries collection");
  }
  return feature(topology, countries).features.filter(
    (country) => !HIDDEN_FEATURE_IDS.has(String(country.id)),
  );
}

function loadWorld(): Promise<CountryFeature[]> {
  worldPromise ??= fetchWorld().catch((err: unknown) => {
    worldPromise = null; // allow a retry on the next dashboard visit
    throw err instanceof Error ? err : new Error(String(err));
  });
  return worldPromise;
}

/** Lazy-loaded chunk: fetches the world topology, then renders the map. */
export default function GeoMapLoader({ entries }: { entries: TopEntry[] }) {
  const [features, setFeatures] = useState<CountryFeature[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadWorld()
      .then((loaded) => {
        if (!cancelled) setFeatures(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="muted">{en.stats.map.unavailable}</p>;
  if (features === null) return <p className="muted">{en.app.loading}</p>;
  return <GeoMap features={features} entries={entries} />;
}
