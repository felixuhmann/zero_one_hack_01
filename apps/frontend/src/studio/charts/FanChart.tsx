import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";

import type { BandPoint, SeriesPoint } from "@/studio/data";

interface FanChartProps {
  history: SeriesPoint[];
  band: BandPoint[];
  horizonMonths: number;
  unit?: string;
  decimals?: number;
  historyLabel?: string;
  backtest?: { t: string; pred: number }[];
  // fixed y-axis range; when set, tweaking the forecast won't rescale the
  // static history/backtest portion of the chart
  yDomain?: [number, number];
}

const W = 940;
const H = 440;
const PAD = { l: 46, r: 18, t: 20, b: 30 };

function fmtMonth(t: string): string {
  const [y, m] = t.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m)]} '${y.slice(2)}`;
}

export function FanChart({
  history,
  band,
  horizonMonths,
  unit = "%",
  decimals = 2,
  historyLabel = "Realised funds rate",
  backtest,
  yDomain,
}: FanChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const tickDecimals = decimals === 0 ? 0 : 1;

  const model = useMemo(() => {
    // Unified timeline: history offsets then forecast offsets (seam shared).
    const histLen = history.length;
    const cols = histLen + band.length - 1; // band[0] == seam == last history
    const idxOf = (i: number) => i; // sequential index across the joined arrays

    const allVals: number[] = [
      ...history.map((p) => p.v),
      ...band.flatMap((b) => [b.p05, b.p95]),
    ];
    const min = yDomain ? yDomain[0] : Math.min(...allVals) - 0.25;
    const max = yDomain ? yDomain[1] : Math.max(...allVals) + 0.25;

    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const x = (i: number) => PAD.l + (i / (cols - 1)) * innerW;
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * innerH;

    // forecast columns start at the seam index (histLen - 1)
    const seamIdx = histLen - 1;
    const fIdx = (k: number) => seamIdx + k; // k over band array

    const histLine = history.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.v)}`).join(" ");

    const areaPath = (lo: (b: BandPoint) => number, hi: (b: BandPoint) => number) => {
      const top = band.map((b, k) => `${k === 0 ? "M" : "L"}${x(fIdx(k))},${y(hi(b))}`).join(" ");
      const bottom = band
        .slice()
        .reverse()
        .map((b, k) => `L${x(fIdx(band.length - 1 - k))},${y(lo(b))}`)
        .join(" ");
      return `${top} ${bottom} Z`;
    };

    const medianLine = band.map((b, k) => `${k === 0 ? "M" : "L"}${x(fIdx(k))},${y(b.p50)}`).join(" ");

    const yTicks: { v: number; y: number }[] = [];
    const step = (max - min) / 4;
    for (let i = 0; i <= 4; i++) {
      const v = min + step * i;
      yTicks.push({ v, y: y(v) });
    }

    const xLabels: { i: number; label: string }[] = [];
    for (let i = 0; i < cols; i += Math.ceil(cols / 8)) {
      const label = i < histLen ? history[i].t : band[i - seamIdx].t;
      xLabels.push({ i, label });
    }

    // backtest held-out p50 path, anchored to history month indices (left of seam)
    const btPts = (backtest ?? [])
      .map((d) => ({ hi: history.findIndex((h) => h.t === d.t), pred: d.pred, t: d.t }))
      .filter((p) => p.hi >= 0)
      .sort((a, b) => a.hi - b.hi);
    const backtestLine =
      btPts.length >= 2
        ? btPts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.hi)},${y(p.pred)}`).join(" ")
        : null;
    const backtestDots = btPts.map((p) => ({ cx: x(p.hi), cy: y(p.pred) }));

    return {
      cols,
      idxOf,
      x,
      y,
      seamIdx,
      fIdx,
      histLine,
      area90: areaPath((b) => b.p05, (b) => b.p95),
      area50: areaPath((b) => b.p25, (b) => b.p75),
      medianLine,
      yTicks,
      xLabels,
      histLen,
      min,
      max,
      backtestLine,
      backtestDots,
    };
  }, [history, band, backtest, yDomain]);

  const horizonIdx = model.fIdx(Math.min(horizonMonths, band.length - 1));

  function onMove(e: React.MouseEvent) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = (e.clientX - rect.left) / rect.width;
    const i = Math.round(frac * (model.cols - 1));
    setHover(Math.max(0, Math.min(model.cols - 1, i)));
  }

  const hoverData = useMemo(() => {
    if (hover == null) return null;
    if (hover < model.histLen) {
      return { kind: "hist" as const, t: history[hover].t, v: history[hover].v };
    }
    const b = band[hover - model.seamIdx];
    return { kind: "fc" as const, t: b.t, p05: b.p05, p25: b.p25, p50: b.p50, p75: b.p75, p95: b.p95 };
  }, [hover, history, band, model]);

  return (
    <div ref={wrapRef} className="relative w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }}>
        <defs>
          <linearGradient id="fan90" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--st-brand)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--st-brand)" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="fan50" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--st-brand)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--st-brand)" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {model.yTicks.map((tk) => (
          <g key={tk.v}>
            <line x1={PAD.l} y1={tk.y} x2={W - PAD.r} y2={tk.y} stroke="var(--st-line)" strokeWidth="1" />
            <text x={PAD.l - 8} y={tk.y + 3} textAnchor="end" className="st-mono" fontSize="10" fill="var(--st-faint)">
              {tk.v.toFixed(tickDecimals)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {model.xLabels.map((xl) => (
          <text
            key={xl.i}
            x={model.x(xl.i)}
            y={H - 10}
            textAnchor="middle"
            className="st-mono"
            fontSize="9.5"
            fill="var(--st-faint)"
          >
            {fmtMonth(xl.label)}
          </text>
        ))}

        {/* forecast region shade */}
        <rect
          x={model.x(model.seamIdx)}
          y={PAD.t}
          width={W - PAD.r - model.x(model.seamIdx)}
          height={H - PAD.t - PAD.b}
          fill="color-mix(in oklch, var(--st-ink) 4%, transparent)"
        />

        {/* bands */}
        <motion.path
          d={model.area90}
          fill="url(#fan90)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        />
        <motion.path
          d={model.area50}
          fill="url(#fan50)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
        />

        {/* horizon marker */}
        <line
          x1={model.x(horizonIdx)}
          y1={PAD.t}
          x2={model.x(horizonIdx)}
          y2={H - PAD.b}
          stroke="var(--st-brand)"
          strokeWidth="1"
          strokeDasharray="3 4"
          opacity="0.55"
        />
        <text
          x={model.x(horizonIdx)}
          y={PAD.t + 12}
          textAnchor="middle"
          className="st-mono"
          fontSize="9"
          fill="var(--st-brand)"
        >
          +{horizonMonths}M
        </text>

        {/* seam */}
        <line x1={model.x(model.seamIdx)} y1={PAD.t} x2={model.x(model.seamIdx)} y2={H - PAD.b} stroke="var(--st-line-strong)" strokeWidth="1" />
        <text x={model.x(model.seamIdx)} y={H - PAD.b + 22} textAnchor="middle" className="st-eyebrow" fontSize="8.5" fill="var(--st-muted)">
          NOW
        </text>

        {/* history line */}
        <motion.path
          d={model.histLine}
          fill="none"
          stroke="var(--st-ink-soft)"
          strokeWidth="2"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />

        {/* backtest: held-out predicted path over realised history */}
        {model.backtestLine && (
          <>
            <motion.path
              d={model.backtestLine}
              fill="none"
              stroke="var(--st-hold)"
              strokeWidth="2"
              strokeDasharray="2 3"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: "easeInOut", delay: 0.2 }}
            />
            {model.backtestDots.map((d, i) => (
              <circle key={i} cx={d.cx} cy={d.cy} r="2" fill="var(--st-hold)" />
            ))}
          </>
        )}

        {/* median forecast */}
        <motion.path
          d={model.medianLine}
          fill="none"
          stroke="var(--st-brand)"
          strokeWidth="2.5"
          strokeDasharray="6 5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: "easeInOut", delay: 0.35 }}
        />

        {/* hover scrubber */}
        {hover != null && hoverData && (
          <g>
            <line x1={model.x(hover)} y1={PAD.t} x2={model.x(hover)} y2={H - PAD.b} stroke="var(--st-ink)" strokeWidth="1" opacity="0.35" />
            {hoverData.kind === "hist" ? (
              <circle cx={model.x(hover)} cy={model.y(hoverData.v)} r="4" fill="var(--st-ink-soft)" />
            ) : (
              <>
                <circle cx={model.x(hover)} cy={model.y(hoverData.p50)} r="4.5" fill="var(--st-brand)" stroke="var(--st-bg)" strokeWidth="1.5" />
                <circle cx={model.x(hover)} cy={model.y(hoverData.p95)} r="2.5" fill="var(--st-brand-dim)" />
                <circle cx={model.x(hover)} cy={model.y(hoverData.p05)} r="2.5" fill="var(--st-brand-dim)" />
              </>
            )}
          </g>
        )}
      </svg>

      {hover != null && hoverData && (
        <Tooltip wrapRef={wrapRef} xFrac={model.x(hover) / W} data={hoverData} unit={unit} decimals={decimals} />
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1">
        <Legend swatch="line" color="var(--st-ink-soft)" label={historyLabel || "Ground truth"} />
        <Legend swatch="dash" color="var(--st-brand)" label="Median forecast (p50)" />
        <Legend swatch="band" color="var(--st-brand)" label="50% band (p25–p75)" />
        <Legend swatch="band-faint" color="var(--st-brand)" label="90% band (p05–p95)" />
        {model.backtestLine && <Legend swatch="dash" color="var(--st-hold)" label="Backtest (held-out prediction)" />}
      </div>
    </div>
  );
}

function Tooltip({
  wrapRef,
  xFrac,
  data,
  unit,
  decimals,
}: {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  xFrac: number;
  unit: string;
  decimals: number;
  data:
    | { kind: "hist"; t: string; v: number }
    | { kind: "fc"; t: string; p05: number; p25: number; p50: number; p75: number; p95: number };
}) {
  const w = wrapRef.current?.clientWidth ?? W;
  const left = Math.min(Math.max(xFrac * w, 70), w - 70);
  const fmt = (v: number) => `${v.toFixed(decimals)}${unit}`;
  return (
    <div
      className="st-panel-2 pointer-events-none absolute top-2 z-10 -translate-x-1/2 px-3 py-2 text-xs shadow-xl"
      style={{ left, background: "var(--st-elev)" }}
    >
      <div className="st-eyebrow mb-1" style={{ fontSize: 9 }}>
        {fmtMonth(data.t)}
      </div>
      {data.kind === "hist" ? (
        <div className="st-mono text-sm" style={{ color: "var(--st-ink)" }}>
          {fmt(data.v)}
        </div>
      ) : (
        <div className="space-y-0.5">
          <div className="st-mono text-base" style={{ color: "var(--st-brand)" }}>
            {fmt(data.p50)}
          </div>
          <div className="st-mono" style={{ color: "var(--st-muted)", fontSize: 10 }}>
            50%: {fmt(data.p25)}–{fmt(data.p75)}
          </div>
          <div className="st-mono" style={{ color: "var(--st-faint)", fontSize: 10 }}>
            90%: {fmt(data.p05)}–{fmt(data.p95)}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ swatch, color, label }: { swatch: string; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block"
        style={{
          width: 16,
          height: swatch === "band" || swatch === "band-faint" ? 9 : 2,
          borderRadius: 2,
          background:
            swatch === "band"
              ? `color-mix(in oklch, ${color} 38%, transparent)`
              : swatch === "band-faint"
                ? `color-mix(in oklch, ${color} 16%, transparent)`
                : color,
          borderTop: swatch === "dash" ? `2px dashed ${color}` : undefined,
          backgroundClip: swatch === "dash" ? "border-box" : undefined,
        }}
      />
      <span style={{ color: "var(--st-muted)", fontSize: 11 }}>{label}</span>
    </div>
  );
}
