import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, LineChart, Scale } from "lucide-react";

import {
  CURRENT_RATE,
  PROPOSED_SOURCES,
  TEMPERAMENTS,
  backtestOverlay,
  buildForecastBand,
  defaultAssumptions,
  evaluateDecision,
  fundsHistory,
  getSeriesForecast,
  type CalibrationState,
  type SeriesForecast,
} from "@/studio/data";
import { FanChart } from "@/studio/charts/FanChart";
import { AgentBubble, Eyebrow, Pill, StatBlock, StudioButton } from "@/studio/ui/bits";

interface Props {
  calibration: CalibrationState;
  onCalibrationChange: (v: CalibrationState) => void;
  include: Record<string, boolean>;
  onBack: () => void;
  onNext: () => void;
}

export function ForecastReview({ calibration, onCalibrationChange, include, onBack, onNext }: Props) {
  const [horizon, setHorizon] = useState<3 | 6 | 12>(calibration.horizon);
  const [activeTab, setActiveTab] = useState(0);

  const setCal = <K extends keyof CalibrationState>(k: K, v: CalibrationState[K]) =>
    onCalibrationChange({ ...calibration, [k]: v });

  // the funds-rate path reacts live to the calibration controls
  const decision = useMemo(
    () => evaluateDecision(calibration, defaultAssumptions()),
    [calibration],
  );
  const history = useMemo(() => fundsHistory(), []);
  const band = useMemo(() => buildForecastBand(decision.driftBps), [decision.driftBps]);
  const backtest = useMemo(() => backtestOverlay().map((d) => ({ t: d.t, pred: d.pred })), []);

  // Fixed y-axis: history + backtest are static real data; only the forecast
  // fan should move when the reaction function changes. The domain spans the
  // full range the forecast can ever reach (driftBps is clamped to -175..100).
  const fundsYDomain = useMemo<[number, number]>(() => {
    const vals = [
      ...history.map((h) => h.v),
      ...backtest.map((b) => b.pred),
      ...buildForecastBand(-175).flatMap((b) => [b.p05, b.p95]),
      ...buildForecastBand(100).flatMap((b) => [b.p05, b.p95]),
    ];
    return [Math.min(...vals) - 0.25, Math.max(...vals) + 0.25];
  }, [history, backtest]);

  // per-series Sybilion forecasts for every selected input (the policy target
  // FEDFUNDS is the dynamic graph below, so it is excluded from the tabs)
  const seriesList = useMemo(
    () =>
      PROPOSED_SOURCES.filter((s) => include[s.seriesId] && s.seriesId !== "FEDFUNDS")
        .map((s) => getSeriesForecast(s.seriesId))
        .filter((s): s is SeriesForecast => s !== null),
    [include],
  );
  const active = seriesList[Math.min(activeTab, seriesList.length - 1)] ?? null;

  const hp = band[horizon];
  const medianDelta = hp.p50 - CURRENT_RATE;
  const rangeWidth = hp.p95 - hp.p05;
  const impliedCuts = Math.max(0, Math.round(-medianDelta / 0.25));
  const priceWeight = 100 - calibration.mandate;
  const evidenceLabel = calibration.risk > 60 ? "Preemptive" : calibration.risk < 35 ? "Cautious" : "Measured";

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <Eyebrow>Step 04 · Forecast</Eyebrow>
        <h1 className="st-display text-4xl md:text-5xl" style={{ color: "var(--st-ink)" }}>
          The probable paths
        </h1>
        <div className="max-w-2xl">
          <AgentBubble>
            Sybilion returned a probabilistic forecast for{" "}
            <span style={{ color: "var(--st-brand)" }}>each signal you approved</span> — tab through them
            below. The calibrated funds-rate path then re-derives live as you tune your reaction function.
          </AgentBubble>
        </div>
      </div>

      {/* per-series forecasts — tab through every selected input */}
      <div className="st-panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LineChart className="h-4 w-4" style={{ color: "var(--st-brand)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
              Sybilion forecasts · per signal
            </span>
          </div>
          {seriesList.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {seriesList.map((s, i) => (
                <button
                  key={s.seriesId}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className="st-focus-ring rounded-full px-3 py-1.5 st-mono text-[11px] transition-all"
                  style={{
                    background: i === activeTab ? "var(--st-brand)" : "var(--st-panel-2)",
                    color: i === activeTab ? "var(--st-bg-deep)" : "var(--st-muted)",
                    border: "1px solid var(--st-line)",
                  }}
                >
                  {s.seriesId}
                </button>
              ))}
            </div>
          )}
        </div>

        {active ? (
          <>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[15px] font-medium" style={{ color: "var(--st-ink)" }}>
                {active.title}
              </span>
              <span className="st-mono text-[11px]" style={{ color: "var(--st-faint)" }}>
                now {fmtVal(active.start, active)} → 12M median {fmtVal(active.terminal, active)}
              </span>
            </div>
            <FanChart
              key={active.seriesId}
              history={active.history}
              band={active.band}
              horizonMonths={horizon}
              unit={active.unit}
              decimals={active.decimals}
              historyLabel="Realised"
            />
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--st-muted)" }}>
              {active.read}
            </p>
          </>
        ) : (
          <p className="py-10 text-center text-[13px]" style={{ color: "var(--st-faint)" }}>
            No input signals selected — go back and approve at least one data source.
          </p>
        )}
      </div>

      {/* dynamic funds-rate path + calibration controls */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="st-panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
                Federal Funds Rate · calibrated path
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
          <FanChart history={history} band={band} horizonMonths={horizon} backtest={backtest} yDomain={fundsYDomain} />
        </div>

        <div className="space-y-4">
          {/* reaction function — drives the path above */}
          <div className="st-panel p-5">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4" style={{ color: "var(--st-brand)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
                Your reaction function
              </span>
            </div>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--st-faint)" }}>
              Tune your stance — the funds-rate path re-derives live
            </p>

            <div className="mt-4 space-y-4">
              <CalSlider
                label="Dual-mandate balance"
                value="balanced"
                min={0}
                max={100}
                step={1}
                current={calibration.mandate}
                onChange={(v) => setCal("mandate", v)}
                left={`Price ${priceWeight}%`}
                right={`Jobs ${calibration.mandate}%`}
                ariaLabel="Dual-mandate balance"
              />
              <CalSlider
                label="Evidence threshold"
                value={evidenceLabel}
                min={0}
                max={100}
                step={1}
                current={calibration.risk}
                onChange={(v) => setCal("risk", v)}
                left="Confirm"
                right="Preempt"
                ariaLabel="Evidence threshold"
              />
              <CalSlider
                label="Inflation tolerance"
                value={`+${calibration.inflationTolerance.toFixed(1)}pp`}
                min={0}
                max={2}
                step={0.1}
                current={calibration.inflationTolerance}
                onChange={(v) => setCal("inflationTolerance", v)}
                left="At target"
                right="+2.0pp"
                ariaLabel="Inflation tolerance"
              />
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px]" style={{ color: "var(--st-ink-soft)" }}>
                    Reaction temperament
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {TEMPERAMENTS.map((t) => {
                    const on = calibration.temperament === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setCal("temperament", t.id)}
                        title={t.blurb}
                        className="st-focus-ring rounded-lg px-1.5 py-2 text-center text-[11px] transition-all"
                        style={{
                          background: on ? "var(--st-brand)" : "var(--st-panel-2)",
                          color: on ? "var(--st-bg-deep)" : "var(--st-ink-soft)",
                          border: `1px solid ${on ? "var(--st-brand)" : "var(--st-line)"}`,
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="st-panel grid grid-cols-2 gap-4 p-5">
            <StatBlock label={`Median @ ${horizon}M`} value={`${hp.p50.toFixed(2)}%`} tone="brand" sub={`${medianDelta >= 0 ? "+" : ""}${(medianDelta * 100).toFixed(0)} bps`} />
            <StatBlock label="90% band width" value={`${(rangeWidth * 100).toFixed(0)}`} sub="bps of uncertainty" />
            <StatBlock label="Implied cuts" value={impliedCuts} sub="× 25 bps priced" tone="cut" />
            <StatBlock label="p05 / p95" value={`${hp.p05.toFixed(1)}–${hp.p95.toFixed(1)}`} sub="tail outcomes" />
          </div>
        </div>
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

function fmtVal(v: number, s: { unit: string; decimals: number }): string {
  return `${v.toFixed(s.decimals)}${s.unit}`;
}

function CalSlider({
  label,
  value,
  min,
  max,
  step,
  current,
  onChange,
  left,
  right,
  ariaLabel,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (v: number) => void;
  left: string;
  right: string;
  ariaLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[12.5px]" style={{ color: "var(--st-ink-soft)" }}>
          {label}
        </span>
        <span className="st-mono text-[11px]" style={{ color: "var(--st-brand)" }}>
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full"
        style={{ accentColor: "var(--st-brand)" }}
        aria-label={ariaLabel}
      />
      <div className="mt-0.5 flex justify-between text-[10.5px]" style={{ color: "var(--st-faint)" }}>
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}
