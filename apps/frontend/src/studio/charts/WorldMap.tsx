import { motion } from "motion/react";
import { Lock } from "lucide-react";

import type { Country } from "@/studio/data";

interface WorldMapProps {
  countries: Country[];
  selected: string | null;
  hovered: string | null;
  onSelect: (code: string) => void;
  onHover: (code: string | null) => void;
}

// faint continent "hints" — soft ellipses placed roughly to evoke the globe
const LAND = [
  { cx: 22, cy: 36, rx: 11, ry: 13 }, // N America
  { cx: 32, cy: 68, rx: 6, ry: 12 }, // S America
  { cx: 49, cy: 30, rx: 6, ry: 6 }, // Europe
  { cx: 52, cy: 58, rx: 9, ry: 15 }, // Africa
  { cx: 70, cy: 44, rx: 16, ry: 16 }, // Asia
  { cx: 85, cy: 74, rx: 6, ry: 5 }, // Oceania
];

export function WorldMap({ countries, selected, hovered, onSelect, onHover }: WorldMapProps) {
  const us = countries.find((c) => c.code === "US")!;

  return (
    <div className="st-grain relative aspect-[2/1] w-full overflow-hidden rounded-2xl border" style={{ borderColor: "var(--st-line)", background: "radial-gradient(120% 120% at 30% 10%, oklch(0.93 0.02 200), var(--st-panel-2))" }}>
      <svg viewBox="0 0 100 50" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {/* graticule */}
        {[10, 20, 30, 40].map((y) => (
          <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke="var(--st-line)" strokeWidth="0.12" />
        ))}
        {[20, 40, 60, 80].map((x) => (
          <line key={`v${x}`} x1={x} y1="0" x2={x} y2="50" stroke="var(--st-line)" strokeWidth="0.12" />
        ))}
        {/* land hints */}
        {LAND.map((l, i) => (
          <ellipse key={i} cx={l.cx} cy={l.cy / 2} rx={l.rx} ry={l.ry / 2} fill="oklch(0.82 0.13 188 / 7%)" />
        ))}
      </svg>

      {/* connecting arcs from US to other regions */}
      <svg viewBox="0 0 100 50" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {countries
          .filter((c) => c.code !== "US")
          .map((c) => {
            const mx = (us.x + c.x) / 2;
            const my = Math.min(us.y, c.y) / 2 - 6;
            return (
              <motion.path
                key={c.code}
                d={`M${us.x},${us.y / 2} Q${mx},${my} ${c.x},${c.y / 2}`}
                fill="none"
                stroke="var(--st-brand)"
                strokeWidth="0.18"
                strokeDasharray="1 1.4"
                opacity={hovered === c.code ? 0.75 : 0.18}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.4, delay: 0.3 }}
              />
            );
          })}
      </svg>

      {/* pins */}
      {countries.map((c) => {
        const live = c.status === "live";
        const isSel = selected === c.code;
        const isHov = hovered === c.code;
        return (
          <button
            key={c.code}
            type="button"
            disabled={!live}
            onClick={() => live && onSelect(c.code)}
            onMouseEnter={() => onHover(c.code)}
            onMouseLeave={() => onHover(null)}
            className="st-focus-ring group absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${c.x}%`, top: `${c.y}%`, cursor: live ? "pointer" : "not-allowed" }}
            aria-label={`${c.name} — ${c.bank}`}
          >
            {live && (
              <>
                <span
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ width: 18, height: 18, background: "var(--st-brand)", opacity: 0.35, animation: "st-pulse-ring 2.4s ease-out infinite" }}
                />
                <span
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ width: 18, height: 18, background: "var(--st-brand)", opacity: 0.25, animation: "st-pulse-ring 2.4s ease-out infinite 1.2s" }}
                />
              </>
            )}
            <span
              className="relative grid place-items-center rounded-full transition-all"
              style={{
                width: live ? (isSel ? 18 : 14) : 11,
                height: live ? (isSel ? 18 : 14) : 11,
                background: live ? "var(--st-brand)" : "var(--st-panel-2)",
                border: live ? "2px solid var(--st-bg)" : "1px solid var(--st-line-strong)",
                boxShadow: live ? "0 0 14px var(--st-brand-glow)" : "none",
              }}
            >
              {!live && <Lock style={{ width: 6, height: 6, color: "var(--st-faint)" }} />}
            </span>

            {/* label */}
            <span
              className="st-mono pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 transition-opacity"
              style={{
                fontSize: 9,
                color: live ? "var(--st-ink)" : "var(--st-faint)",
                background: isHov || isSel ? "var(--st-elev)" : "transparent",
                opacity: live || isHov ? 1 : 0.6,
              }}
            >
              {c.code}
              {!live && " · soon"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
