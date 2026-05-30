import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import type { Country } from "@/studio/data";

interface WorldMapProps {
  countries: Country[];
  selected: string | null;
  hovered: string | null;
  onSelect: (code: string) => void;
  onHover: (code: string | null) => void;
  fullBleed?: boolean;
}

interface GeoFeature {
  id: string;
  properties: { name?: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
}
interface GeoData {
  features: GeoFeature[];
}

// equirectangular projection into a 1000 x 500 plane
const PW = 1000;
const PH = 500;
const proj = (lon: number, lat: number): [number, number] => [((lon + 180) / 360) * PW, ((90 - lat) / 180) * PH];

function ringPath(ring: number[][]): string {
  return (
    ring
      .map(([lon, lat], i) => {
        const [x, y] = proj(lon, lat);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + "Z"
  );
}

function featurePath(f: GeoFeature): string {
  if (f.geometry.type === "Polygon") {
    return (f.geometry.coordinates as number[][][]).map(ringPath).join(" ");
  }
  return (f.geometry.coordinates as number[][][][]).flatMap((poly) => poly.map(ringPath)).join(" ");
}

export function WorldMap({ countries, selected, hovered, onSelect, onHover, fullBleed }: WorldMapProps) {
  const [geo, setGeo] = useState<GeoData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/world-countries.geo.json")
      .then((r) => r.json())
      .then((d: GeoData) => alive && setGeo(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const isoToCode = useMemo(() => {
    const m = new Map<string, Country>();
    countries.forEach((c) => c.iso3 && m.set(c.iso3, c));
    return m;
  }, [countries]);

  const paths = useMemo(() => {
    if (!geo) return null;
    const base: string[] = [];
    const focus: { code: string; d: string }[] = [];
    for (const f of geo.features) {
      const c = isoToCode.get(f.id);
      const d = featurePath(f);
      if (c) focus.push({ code: c.code, d });
      else base.push(d);
    }
    return { base: base.join(" "), focus };
  }, [geo, isoToCode]);

  const us = countries.find((c) => c.code === "US")!;
  const [usx, usy] = proj(us.lon, us.lat);

  return (
    <div
      className={cn(
        "st-grain relative overflow-hidden",
        fullBleed ? "h-full w-full" : "w-full rounded-2xl border",
      )}
      style={{
        ...(fullBleed ? {} : { aspectRatio: "1000 / 372", borderColor: "var(--st-line)" }),
        background: "radial-gradient(120% 130% at 28% 4%, color-mix(in oklch, var(--st-brand) 10%, var(--st-bg)), var(--st-panel-2))",
      }}
    >
      <svg
        viewBox={fullBleed ? "0 0 1000 500" : "0 36 1000 372"}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio={fullBleed ? "xMidYMid meet" : "xMidYMid slice"}
      >
        {/* graticule */}
        {[-120, -60, 0, 60, 120].map((lon) => {
          const [x] = proj(lon, 0);
          return <line key={`v${lon}`} x1={x} y1={0} x2={x} y2={PH} stroke="var(--st-line)" strokeWidth="0.6" />;
        })}
        {[60, 30, 0, -30].map((lat) => {
          const [, y] = proj(0, lat);
          return <line key={`h${lat}`} x1={0} y1={y} x2={PW} y2={y} stroke="var(--st-line)" strokeWidth="0.6" />;
        })}

        {!paths && <SkeletonBlobs />}

        {paths && (
          <>
            <path d={paths.base} fill="var(--st-panel-2)" stroke="var(--st-line-strong)" strokeWidth="0.5" strokeLinejoin="round" />

            {paths.focus.map(({ code, d }) => {
              const c = countries.find((x) => x.code === code)!;
              const live = c.status === "live";
              const active = selected === code || hovered === code;
              return (
                <path
                  key={code}
                  d={d}
                  onClick={() => live && onSelect(code)}
                  onMouseEnter={() => onHover(code)}
                  onMouseLeave={() => onHover(null)}
                  strokeWidth={live ? 1 : 0.5}
                  strokeLinejoin="round"
                  style={{
                    cursor: live ? "pointer" : "default",
                    transition: "fill 0.2s",
                    fill: live
                      ? active
                        ? "var(--st-brand)"
                        : "color-mix(in oklch, var(--st-brand) 70%, var(--st-panel-2))"
                      : active
                        ? "color-mix(in oklch, var(--st-ink-soft) 45%, var(--st-panel-2))"
                        : "color-mix(in oklch, var(--st-ink-soft) 22%, var(--st-panel-2))",
                    stroke: live ? "var(--st-brand)" : "var(--st-line-strong)",
                    filter: live ? "drop-shadow(0 0 6px var(--st-brand-glow))" : undefined,
                  }}
                />
              );
            })}

            {/* arcs from US to roadmap pins */}
            {countries
              .filter((c) => c.code !== "US")
              .map((c) => {
                const [cx, cy] = proj(c.lon, c.lat);
                const mx = (usx + cx) / 2;
                const my = Math.min(usy, cy) - 60;
                return (
                  <motion.path
                    key={c.code}
                    d={`M${usx},${usy} Q${mx},${my} ${cx},${cy}`}
                    fill="none"
                    stroke="var(--st-brand)"
                    strokeWidth="1"
                    strokeDasharray="3 5"
                    opacity={hovered === c.code ? 0.7 : 0.16}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.4, delay: 0.3 }}
                  />
                );
              })}

            {/* pins live inside the SVG so they stay aligned under slice scaling */}
            {countries.map((c) => (
              <Pin
                key={c.code}
                country={c}
                selected={selected === c.code}
                hovered={hovered === c.code}
                onSelect={onSelect}
                onHover={onHover}
              />
            ))}
          </>
        )}
      </svg>
    </div>
  );
}

function Pin({
  country: c,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  country: Country;
  selected: boolean;
  hovered: boolean;
  onSelect: (code: string) => void;
  onHover: (code: string | null) => void;
}) {
  const [x, y] = proj(c.lon, c.lat);
  const live = c.status === "live";
  const active = selected || hovered;
  const r = live ? (selected ? 7 : 5.5) : 4.2;

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={() => live && onSelect(c.code)}
      onMouseEnter={() => onHover(c.code)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: live ? "pointer" : "not-allowed" }}
    >
      {/* generous invisible hit target */}
      <circle r={16} fill="transparent" />

      {live &&
        [0, 1.2].map((delay) => (
          <motion.circle
            key={delay}
            r={r}
            fill="var(--st-brand)"
            initial={{ opacity: 0.45, scale: 0.7 }}
            animate={{ opacity: 0, scale: 3 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay }}
          />
        ))}

      <circle
        r={r}
        style={{
          fill: live ? "var(--st-brand)" : "var(--st-elev)",
          stroke: live ? "var(--st-elev)" : "var(--st-line-strong)",
          strokeWidth: live ? 2 : 1.4,
          filter: live ? "drop-shadow(0 0 7px var(--st-brand-glow))" : undefined,
        }}
      />
      {!live && <circle r={1.6} fill="var(--st-faint)" />}

      <text
        y={r + 12}
        textAnchor="middle"
        style={{
          fontFamily: "var(--st-font-mono)",
          fontSize: live ? 12 : 10.5,
          fontWeight: live ? 600 : 500,
          fill: live ? "var(--st-ink)" : "var(--st-muted)",
          opacity: live || active ? 1 : 0.72,
          paintOrder: "stroke",
          stroke: "var(--st-panel)",
          strokeWidth: 3,
          strokeLinejoin: "round",
        }}
      >
        {c.code}
        {!live && active ? " · soon" : ""}
      </text>
    </g>
  );
}

function SkeletonBlobs() {
  return (
    <g style={{ animation: "st-float 2.4s ease-in-out infinite" }}>
      {[
        [200, 220, 70],
        [480, 210, 50],
        [560, 260, 60],
        [700, 240, 90],
        [820, 330, 40],
        [320, 320, 45],
      ].map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="var(--st-panel-2)" opacity="0.6" />
      ))}
    </g>
  );
}
