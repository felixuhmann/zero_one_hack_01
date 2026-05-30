import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, TrendingDown } from "lucide-react";

import {
  BACKTEST,
  CURRENT_RATE,
  backtestOverlay,
  buildForecastBand,
  fundsHistory,
  type CalibrationState,
  type DecisionResult,
} from "@/studio/data";
import { FanChart } from "@/studio/charts/FanChart";
import { DriverHeatmap } from "@/studio/charts/DriverHeatmap";
import { AgentBubble, Eyebrow, Pill, StatBlock, StudioButton } from "@/studio/ui/bits";

interface Props {
  calibration: CalibrationState;
  decision: DecisionResult;
  onBack: () => void;
  onNext: () => void;
}

export function ForecastReview({ calibration, decision, onBack, onNext }: Props) {
  const [horizon, setHorizon] = useState<3 | 6 | 12>(calibration.horizon);
  const history = useMemo(() => fundsHistory(), []);
  const band = useMemo(() => buildForecastBand(decision.driftBps), [decision.driftBps]);

  const hp = band[horizon];
  const medianDelta = hp.p50 - CURRENT_RATE;
  const rangeWidth = hp.p95 - hp.p05;
  const impliedCuts = Math.max(0, Math.round(-medianDelta / 0.25));

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <Eyebrow>Step 05 · Forecast</Eyebrow>
        <h1 className="st-display text-4xl md:text-5xl" style={{ color: "var(--st-ink)" }}>
          The probable paths
        </h1>
        <div className="max-w-2xl">
          <AgentBubble>
            Here's the funds-rate fan. The <span style={{ color: "var(--st-brand)" }}>median path drifts {medianDelta >= 0 ? "+" : ""}{(medianDelta * 100).toFixed(0)} bps</span> by{" "}
            {horizon} months, but read the band, not the line — the spread is where your optionality lives.
          </AgentBubble>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="st-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
                Federal Funds Rate · probabilistic forecast
              </span>
              <Pill tone="brand">FEDFUNDS</Pill>
            </div>
            <div className="flex gap-1">
              {([3, 6, 12] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHorizon(h)}
                  className="st-focus-ring rounded-md px-2.5 py-1 st-mono text-[11px] transition-all"
                  style={{
                    background: horizon === h ? "var(--st-brand)" : "var(--st-panel-2)",
                    color: horizon === h ? "var(--st-bg-deep)" : "var(--st-muted)",
                  }}
                >
                  {h}M
                </button>
              ))}
            </div>
          </div>
          <FanChart history={history} band={band} horizonMonths={horizon} />
        </div>

        <div className="space-y-4">
          <div className="st-panel grid grid-cols-2 gap-4 p-5">
            <StatBlock label={`Median @ ${horizon}M`} value={`${hp.p50.toFixed(2)}%`} tone="brand" sub={`${medianDelta >= 0 ? "+" : ""}${(medianDelta * 100).toFixed(0)} bps`} />
            <StatBlock label="90% band width" value={`${(rangeWidth * 100).toFixed(0)}`} sub="bps of uncertainty" />
            <StatBlock label="Implied cuts" value={impliedCuts} sub="× 25 bps priced" tone="cut" />
            <StatBlock label="p05 / p95" value={`${hp.p05.toFixed(1)}–${hp.p95.toFixed(1)}`} sub="tail outcomes" />
          </div>

          <div className="st-panel p-5">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4" style={{ color: "var(--st-brand)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
                Backtest accuracy
              </span>
            </div>
            <p className="mt-1 text-[11px]" style={{ color: "var(--st-faint)" }}>
              Held-out funds-rate path · predicted vs realised
            </p>
            <BacktestSpark />
            <div className="mt-3 space-y-1.5">
              {BACKTEST.map((b) => (
                <div key={b.seriesId} className="flex items-center justify-between text-[11.5px]">
                  <span style={{ color: "var(--st-ink-soft)" }}>{b.label}</span>
                  <span className="flex items-center gap-3">
                    <span className="st-mono" style={{ color: "var(--st-muted)" }}>
                      MAE {b.mae.toFixed(2)}
                    </span>
                    <span className="st-mono" style={{ color: "var(--st-brand)" }}>
                      +{Math.round(b.vsNaive * 100)}% vs naïve
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* driver importance over horizon */}
      <div className="st-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
              Driver importance across the horizon
            </span>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--st-faint)" }}>
              What's moving the forecast — and which way it pushes the rate
            </p>
          </div>
        </div>
        <DriverHeatmap activeHorizon={horizon} />
      </div>

      <div className="flex items-center justify-between pt-2">
        <StudioButton variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </StudioButton>
        <StudioButton onClick={onNext}>
          Synthesise the decision <ArrowRight className="h-4 w-4" />
        </StudioButton>
      </div>
    </div>
  );
}

function BacktestSpark() {
  const data = backtestOverlay();
  const W = 280;
  const H = 70;
  const vals = data.flatMap((d) => [d.actual, d.pred]);
  const min = Math.min(...vals) - 0.1;
  const max = Math.max(...vals) + 0.1;
  const x = (i: number) => (i / (data.length - 1)) * (W - 8) + 4;
  const y = (v: number) => H - 6 - ((v - min) / (max - min)) * (H - 12);
  const line = (key: "actual" | "pred") => data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[key])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full">
      <path d={line("actual")} fill="none" stroke="var(--st-ink-soft)" strokeWidth="2" />
      <path d={line("pred")} fill="none" stroke="var(--st-brand)" strokeWidth="2" strokeDasharray="4 3" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.actual)} r="1.6" fill="var(--st-ink-soft)" />
      ))}
    </svg>
  );
}
