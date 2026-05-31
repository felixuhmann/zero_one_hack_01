import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";

import { normalizeChartDate } from "@/lib/chartDates";
import type { BandPoint, SeriesPoint } from "@/studio/data";

interface FanChartProps {
  history: SeriesPoint[];
  band: BandPoint[];
  horizonMonths: number;
  unit?: string;
  decimals?: number;
  historyLabel?: string;
  backtest?: { t: string; pred: number }[];
  scenarioPath?: { t: string; v: number }[];
  scenarioColor?: string;
  scenarioLegend?: string;
  baselineScenarioPath?: { t: string; v: number }[];
  baselineScenarioLegend?: string;
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

type HoverData =
  | { kind: "hist"; t: string; v: number }
  | { kind: "backtest"; t: string; v: number }
  | { kind: "scenario"; t: string; v: number }
  | { kind: "baseline"; t: string; v: number }
  | { kind: "fc"; t: string; p05: number; p25: number; p50: number; p75: number; p95: number };

type HoverState = { col: number; data: HoverData };

type NearestCandidate = HoverData & { dist: number };

export function FanChart({
  history,
  band,
  horizonMonths,
  unit = "%",
  decimals = 2,
  historyLabel = "Realised funds rate",
  backtest,
  scenarioPath,
  scenarioColor = "var(--st-muted)",
  scenarioLegend = "Scenario path",
  baselineScenarioPath,
  baselineScenarioLegend = "Baseline ensemble (catalog weights)",
  yDomain,
}: FanChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);
  const tickDecimals = decimals === 0 ? 0 : 1;
  const gradId = useMemo(
    () => `fan-${Math.random().toString(36).slice(2, 9)}`,
    [],
  );

  const model = useMemo(() => {
    if (!history.length || band.length < 2) {
      return null;
    }

    const histDates = history.map((p) => normalizeChartDate(p.t));
    const bandDates = band.map((b) => normalizeChartDate(b.t));

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
      .map((d) => {
        const key = normalizeChartDate(d.t);
        const hi = histDates.findIndex((h) => h === key);
        return { hi, pred: d.pred, t: key };
      })
      .filter((p) => p.hi >= 0)
      .sort((a, b) => a.hi - b.hi);
    const backtestLine =
      btPts.length >= 2
        ? btPts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.hi)},${y(p.pred)}`).join(" ")
        : null;
    const backtestDots = btPts.map((p) => ({ cx: x(p.hi), cy: y(p.pred), t: p.t, pred: p.pred }));

    const mapPath = (path: { t: string; v: number }[] | undefined) => {
      const cols = (path ?? [])
        .map((p) => {
          const key = normalizeChartDate(p.t);
          const hi = histDates.findIndex((h) => h === key);
          if (hi >= 0) return { col: hi, v: p.v, t: key };
          const bi = bandDates.findIndex((b) => b === key);
          if (bi >= 0) return { col: fIdx(bi), v: p.v, t: key };
          return null;
        })
        .filter((p): p is { col: number; v: number; t: string } => p != null)
        .sort((a, b) => a.col - b.col);

      const line =
        cols.length >= 2
          ? cols.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.col)},${y(p.v)}`).join(" ")
          : cols.length === 1
            ? `M${x(cols[0].col)},${y(cols[0].v)}`
            : null;
      const dots = cols.map((p) => ({ cx: x(p.col), cy: y(p.v), t: p.t, v: p.v }));
      return { cols, line, dots };
    };

    const baseline = mapPath(baselineScenarioPath);
    const scenario = mapPath(scenarioPath);

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
      baselineLine: baseline.line,
      baselineDots: baseline.dots,
      baselineCols: baseline.cols,
      scenarioLine: scenario.line,
      scenarioDots: scenario.dots,
      scenarioCols: scenario.cols,
    };
  }, [history, band, backtest, scenarioPath, baselineScenarioPath, yDomain]);

  if (!model) {
    return (
      <div className="py-12 text-center text-[13px] text-muted-foreground">
        Not enough history or forecast points to draw this chart.
      </div>
    );
  }

  const chart = model;
  const horizonIdx = chart.fIdx(Math.min(horizonMonths, band.length - 1));

  function pickNearestAtColumn(col: number, svgY: number): HoverData | null {
    const candidates: NearestCandidate[] = [];

    if (col < chart.histLen) {
      const v = history[col].v;
      candidates.push({
        kind: "hist",
        t: history[col].t,
        v,
        dist: Math.abs(svgY - chart.y(v)),
      });
    }

    const bt = chart.backtestDots.find((d) => history.findIndex((h) => h.t === d.t) === col);
    if (bt) {
      candidates.push({
        kind: "backtest",
        t: bt.t,
        v: bt.pred,
        dist: Math.abs(svgY - bt.cy),
      });
    }

    const sc = chart.scenarioCols.find((p) => p.col === col);
    if (sc) {
      const dot = chart.scenarioDots.find((d) => d.t === sc.t);
      candidates.push({
        kind: "scenario",
        t: sc.t,
        v: sc.v,
        dist: Math.abs(svgY - (dot?.cy ?? chart.y(sc.v))),
      });
    }

    const bl = chart.baselineCols.find((p) => p.col === col);
    if (bl) {
      const dot = chart.baselineDots.find((d) => d.t === bl.t);
      candidates.push({
        kind: "baseline",
        t: bl.t,
        v: bl.v,
        dist: Math.abs(svgY - (dot?.cy ?? chart.y(bl.v))),
      });
    }

    if (col >= chart.seamIdx) {
      const b = band[col - chart.seamIdx];
      if (b) {
        candidates.push({
          kind: "fc",
          t: b.t,
          p05: b.p05,
          p25: b.p25,
          p50: b.p50,
          p75: b.p75,
          p95: b.p95,
          dist: Math.abs(svgY - chart.y(b.p50)),
        });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.dist - b.dist);
    const { dist: _d, ...data } = candidates[0];
    return data;
  }

  function onMove(e: React.MouseEvent) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const svgY = ((e.clientY - rect.top) / rect.height) * H;
    const innerW = W - PAD.l - PAD.r;
    const col = Math.round(((svgX - PAD.l) / innerW) * (chart.cols - 1));
    const colClamped = Math.max(0, Math.min(chart.cols - 1, col));
    const data = pickNearestAtColumn(colClamped, svgY);
    if (!data) {
      setHoverState(null);
      return;
    }
    setHoverState({ col: colClamped, data });
  }

  return (
    <div ref={wrapRef} className="relative w-full" onMouseMove={onMove} onMouseLeave={() => setHoverState(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }}>
        <defs>
          <linearGradient id={`${gradId}-90`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--st-brand)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--st-brand)" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id={`${gradId}-50`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--st-brand)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--st-brand)" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {chart.yTicks.map((tk) => (
          <g key={tk.v}>
            <line x1={PAD.l} y1={tk.y} x2={W - PAD.r} y2={tk.y} stroke="var(--st-line)" strokeWidth="1" />
            <text x={PAD.l - 8} y={tk.y + 3} textAnchor="end" className="st-mono" fontSize="10" fill="var(--st-faint)">
              {tk.v.toFixed(tickDecimals)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {chart.xLabels.map((xl) => (
          <text
            key={xl.i}
            x={chart.x(xl.i)}
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
          x={chart.x(chart.seamIdx)}
          y={PAD.t}
          width={W - PAD.r - chart.x(chart.seamIdx)}
          height={H - PAD.t - PAD.b}
          fill="color-mix(in oklch, var(--st-ink) 4%, transparent)"
        />

        {/* bands */}
        <motion.path
          d={chart.area90}
          fill={`url(#${gradId}-90)`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        />
        <motion.path
          d={chart.area50}
          fill={`url(#${gradId}-50)`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.25 }}
        />

        {/* horizon marker */}
        <line
          x1={chart.x(horizonIdx)}
          y1={PAD.t}
          x2={chart.x(horizonIdx)}
          y2={H - PAD.b}
          stroke="var(--st-brand)"
          strokeWidth="1"
          strokeDasharray="3 4"
          opacity="0.55"
        />
        <text
          x={chart.x(horizonIdx)}
          y={PAD.t + 12}
          textAnchor="middle"
          className="st-mono"
          fontSize="9"
          fill="var(--st-brand)"
        >
          +{horizonMonths}M
        </text>

        {/* seam */}
        <line x1={chart.x(chart.seamIdx)} y1={PAD.t} x2={chart.x(chart.seamIdx)} y2={H - PAD.b} stroke="var(--st-line-strong)" strokeWidth="1" />
        <text x={chart.x(chart.seamIdx)} y={H - PAD.b + 22} textAnchor="middle" className="st-eyebrow" fontSize="8.5" fill="var(--st-muted)">
          NOW
        </text>

        {/* history line */}
        <motion.path
          d={chart.histLine}
          fill="none"
          stroke="var(--st-ink-soft)"
          strokeWidth="2"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
        />

        {/* backtest: held-out predicted path over realised history.
            Violet dotted overlay, sits left of the seam so it never overlaps
            the forecast median. */}
        {chart.backtestLine && (
          <>
            <motion.path
              d={chart.backtestLine}
              fill="none"
              stroke="var(--st-backtest)"
              strokeWidth="1.75"
              strokeDasharray="1 4"
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.85 }}
              transition={{ duration: 0.6, ease: "easeInOut", delay: 0.2 }}
            />
            {chart.backtestDots.map((d, i) => (
              <circle key={i} cx={d.cx} cy={d.cy} r="1.6" fill="var(--st-backtest)" opacity={0.85} />
            ))}
          </>
        )}

        {/* pipeline ensemble (fixed catalog weights) */}
        {chart.baselineLine && (
          <>
            <path
              d={chart.baselineLine}
              fill="none"
              stroke="var(--st-muted)"
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
            {chart.baselineDots.map((d, i) => (
              <circle key={`bl-${i}`} cx={d.cx} cy={d.cy} r="2.5" fill="var(--st-muted)" />
            ))}
          </>
        )}

        {/* chair-weighted ensemble */}
        {chart.scenarioLine && (
          <>
            <path
              d={chart.scenarioLine}
              fill="none"
              stroke={scenarioColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {chart.scenarioDots.map((d, i) => (
              <circle key={`sc-${i}`} cx={d.cx} cy={d.cy} r="3.5" fill={scenarioColor} stroke="var(--st-bg)" strokeWidth="1.5" />
            ))}
          </>
        )}

        {/* median forecast — opacity fade (not pathLength, which would hijack
            strokeDasharray and render the dashes as a solid line) */}
        <motion.path
          d={chart.medianLine}
          fill="none"
          stroke="var(--st-brand)"
          strokeWidth="2.5"
          strokeDasharray="6 5"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeInOut", delay: 0.35 }}
        />

        {/* hover scrubber */}
        {hoverState && (
          <g>
            <line
              x1={chart.x(hoverState.col)}
              y1={PAD.t}
              x2={chart.x(hoverState.col)}
              y2={H - PAD.b}
              stroke="var(--st-ink)"
              strokeWidth="1"
              opacity="0.35"
            />
            {hoverState.data.kind === "hist" ? (
              <circle
                cx={chart.x(hoverState.col)}
                cy={chart.y(hoverState.data.v)}
                r="4"
                fill="var(--st-ink-soft)"
              />
            ) : hoverState.data.kind === "backtest" ? (
              <circle
                cx={chart.x(hoverState.col)}
                cy={chart.y(hoverState.data.v)}
                r="4"
                fill="var(--st-backtest)"
              />
            ) : hoverState.data.kind === "scenario" ? (
              <circle
                cx={chart.x(hoverState.col)}
                cy={chart.y(hoverState.data.v)}
                r="4.5"
                fill={scenarioColor}
                stroke="var(--st-bg)"
                strokeWidth="1.5"
              />
            ) : hoverState.data.kind === "baseline" ? (
              <circle
                cx={chart.x(hoverState.col)}
                cy={chart.y(hoverState.data.v)}
                r="4"
                fill="var(--st-muted)"
              />
            ) : (
              <>
                <circle
                  cx={chart.x(hoverState.col)}
                  cy={chart.y(hoverState.data.p50)}
                  r="4.5"
                  fill="var(--st-brand)"
                  stroke="var(--st-bg)"
                  strokeWidth="1.5"
                />
                <circle
                  cx={chart.x(hoverState.col)}
                  cy={chart.y(hoverState.data.p95)}
                  r="2.5"
                  fill="var(--st-brand-dim)"
                />
                <circle
                  cx={chart.x(hoverState.col)}
                  cy={chart.y(hoverState.data.p05)}
                  r="2.5"
                  fill="var(--st-brand-dim)"
                />
              </>
            )}
          </g>
        )}
      </svg>

      {hoverState && (
        <Tooltip
          wrapRef={wrapRef}
          xFrac={chart.x(hoverState.col) / W}
          data={hoverState.data}
          unit={unit}
          decimals={decimals}
          historyLabel={historyLabel}
          scenarioColor={scenarioColor}
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
        <LegendGroup title="Forecast">
          <Legend swatch="line" color="var(--st-ink-soft)" label={historyLabel || "Ground truth"} />
          <Legend swatch="dash" color="var(--st-brand)" label="Median (p50)" />
          <Legend swatch="band" color="var(--st-brand)" label="50% band" />
          <Legend swatch="band-faint" color="var(--st-brand)" label="90% band" />
          {chart.backtestLine && (
            <Legend swatch="dot" color="var(--st-backtest)" label="Backtest (held-out)" />
          )}
        </LegendGroup>
        {(chart.baselineLine || chart.scenarioLine || chart.scenarioDots.length > 0) && (
          <>
            <span className="hidden h-3.5 w-px shrink-0 self-center sm:inline-block" style={{ background: "var(--st-line-strong)" }} />
            <LegendGroup title="Policy blend">
              {chart.baselineLine && (
                <Legend swatch="dash" color="var(--st-muted)" label={baselineScenarioLegend} />
              )}
              {(chart.scenarioLine || chart.scenarioDots.length > 0) && (
                <Legend swatch="line-dot" color={scenarioColor} label={scenarioLegend} />
              )}
            </LegendGroup>
          </>
        )}
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
  historyLabel = "Ground truth",
  scenarioColor = "var(--st-muted)",
}: {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  xFrac: number;
  unit: string;
  decimals: number;
  historyLabel?: string;
  scenarioColor?: string;
  data: HoverData;
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
        <div>
          <div className="st-eyebrow mb-0.5" style={{ fontSize: 8, color: "var(--st-muted)" }}>
            {historyLabel}
          </div>
          <div className="st-mono text-sm" style={{ color: "var(--st-ink)" }}>
            {fmt(data.v)}
          </div>
        </div>
      ) : data.kind === "backtest" ? (
        <div>
          <div className="st-eyebrow mb-0.5" style={{ fontSize: 8, color: "var(--st-muted)" }}>
            Backtest p50
          </div>
          <div className="st-mono text-sm" style={{ color: "var(--st-backtest)" }}>
            {fmt(data.v)}
          </div>
        </div>
      ) : data.kind === "scenario" ? (
        <div>
          <div className="st-eyebrow mb-0.5" style={{ fontSize: 8, color: "var(--st-muted)" }}>
            Chair-weighted ensemble
          </div>
          <div className="st-mono text-sm" style={{ color: scenarioColor }}>
            {fmt(data.v)}
          </div>
        </div>
      ) : data.kind === "baseline" ? (
        <div>
          <div className="st-eyebrow mb-0.5" style={{ fontSize: 8, color: "var(--st-muted)" }}>
            Baseline ensemble
          </div>
          <div className="st-mono text-sm" style={{ color: "var(--st-muted)" }}>
            {fmt(data.v)}
          </div>
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

function LegendGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
      <span className="st-eyebrow" style={{ fontSize: 8.5, letterSpacing: "0.14em" }}>
        {title}
      </span>
      {children}
    </div>
  );
}

function Legend({ swatch, color, label }: { swatch: string; color: string; label: string }) {
  const isBand = swatch === "band" || swatch === "band-faint";
  const isDashed = swatch === "dash";
  const isDotted = swatch === "dot";

  return (
    <div className="flex items-center gap-1.5">
      {swatch === "line-dot" ? (
        <span className="relative inline-block" style={{ width: 16, height: 6 }}>
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2"
            style={{ width: 16, height: 2, borderRadius: 2, background: color }}
          />
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ width: 5, height: 5, background: color }}
          />
        </span>
      ) : (
        <span
          className="inline-block"
          style={{
            width: 16,
            height: isBand ? 9 : 2,
            borderRadius: 2,
            background: isBand
              ? swatch === "band"
                ? `color-mix(in oklch, ${color} 38%, transparent)`
                : `color-mix(in oklch, ${color} 16%, transparent)`
              : isDashed || isDotted
                ? "transparent"
                : color,
            borderTop: isDashed
              ? `2px dashed ${color}`
              : isDotted
                ? `2px dotted ${color}`
                : undefined,
          }}
        />
      )}
      <span style={{ color: "var(--st-muted)", fontSize: 11 }}>{label}</span>
    </div>
  );
}
