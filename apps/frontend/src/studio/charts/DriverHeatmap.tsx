import { motion } from "motion/react";

import { DRIVERS, HORIZON_LABELS } from "@/studio/data";

interface DriverHeatmapProps {
  activeHorizon: number; // 3 | 6 | 12
}

const HORIZON_INDEX: Record<number, number> = { 1: 0, 3: 1, 6: 2, 12: 3 };

export function DriverHeatmap({ activeHorizon }: DriverHeatmapProps) {
  const activeCol = HORIZON_INDEX[activeHorizon] ?? 2;

  return (
    <div className="w-full">
      <div className="grid grid-cols-[1fr_repeat(4,38px)_64px] items-center gap-x-2 pb-2">
        <span className="st-eyebrow" style={{ fontSize: 9.5 }}>
          Driver
        </span>
        {HORIZON_LABELS.map((h, i) => (
          <span
            key={h}
            className="st-mono text-center"
            style={{
              fontSize: 10,
              color: i === activeCol ? "var(--st-brand)" : "var(--st-faint)",
              fontWeight: i === activeCol ? 600 : 400,
            }}
          >
            {h}
          </span>
        ))}
        <span className="st-eyebrow text-right" style={{ fontSize: 9.5 }}>
          Tilt
        </span>
      </div>

      <div className="space-y-1.5">
        {DRIVERS.map((d, rowIdx) => (
          <motion.div
            key={d.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: rowIdx * 0.06 }}
            className="group grid grid-cols-[1fr_repeat(4,38px)_64px] items-center gap-x-2"
          >
            <div className="flex items-center gap-2 truncate">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
              <span className="truncate text-[13px]" style={{ color: "var(--st-ink-soft)" }} title={d.read}>
                {d.label}
              </span>
            </div>

            {d.importance.map((imp, i) => (
              <div key={i} className="flex justify-center">
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: rowIdx * 0.06 + i * 0.04 }}
                  className="grid h-8 w-8 place-items-center rounded-md"
                  style={{
                    background: `color-mix(in oklch, ${d.color} ${Math.round(imp * 78)}%, transparent)`,
                    outline: i === activeCol ? "1.5px solid var(--st-brand)" : "1px solid var(--st-line)",
                    outlineOffset: i === activeCol ? "1px" : "0",
                  }}
                >
                  <span
                    className="st-mono"
                    style={{ fontSize: 9.5, color: imp > 0.55 ? "var(--st-elev)" : "var(--st-muted)" }}
                  >
                    {Math.round(imp * 100)}
                  </span>
                </motion.div>
              </div>
            ))}

            <TiltBar value={d.tilt} />
          </motion.div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--st-faint)" }}>
        Cell = signal importance at that horizon (0–100). Notice how the market path dominates near-term
        while the labor read grows toward the 12-month horizon — weights shift as the horizon moves.
      </p>
    </div>
  );
}

function TiltBar({ value }: { value: number }) {
  const pct = Math.min(Math.abs(value), 1) * 100;
  const dovish = value < 0;
  return (
    <div className="relative h-3 w-full rounded-full" style={{ background: "var(--st-line)" }}>
      <div className="absolute left-1/2 top-0 h-full w-px" style={{ background: "var(--st-line-strong)" }} />
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct / 2}%` }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="absolute top-0 h-full rounded-full"
        style={{
          right: dovish ? "50%" : undefined,
          left: dovish ? undefined : "50%",
          background: dovish ? "var(--st-cut)" : "var(--st-hike)",
        }}
      />
    </div>
  );
}
