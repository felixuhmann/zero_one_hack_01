import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CircleHelp, LineChart, Scale } from "lucide-react";

import type { CalibrationState } from "@/studio/data";
import type { PipelineResponse } from "@/types/forecast";
import { SCENARIO_DISPLAY_LABEL } from "@/lib/scenarioChart";
import {
  chairEnsembleWeightSummary,
  pipelineEnsembleWeightSummary,
  synthesizeChairEnsemble,
} from "@/lib/chairEnsemble";
import {
  classifyScenarioFromPipeline,
  scenariosDiffer,
} from "@/lib/scenarioClassifier";
import { scenarioInputCoverage } from "@/lib/scenarioInputCoverage";
import { buildSeriesChartView, buildTargetChartView } from "@/lib/sybilionCharts";
import { FanChart } from "@/studio/charts/FanChart";
import { Eyebrow, Pill, StudioButton, StudioNote } from "@/studio/ui/bits";
import { Card, CardContent } from "@/components/ui/card";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Props {
  calibration: CalibrationState;
  onCalibrationChange: (v: CalibrationState) => void;
  include: Record<string, boolean>;
  aggregatedForecast?: PipelineResponse | null;
  onBack: () => void;
  onNext: () => void;
}

export function ForecastReview({
  calibration,
  onCalibrationChange,
  include,
  aggregatedForecast,
  onBack,
  onNext,
}: Props) {
  const [activeTab, setActiveTab] = useState(0);

  const setCal = <K extends keyof CalibrationState>(k: K, v: CalibrationState[K]) =>
    onCalibrationChange({ ...calibration, [k]: v });

  const { baseScenario, chairScenario } = useMemo(() => {
    if (!aggregatedForecast) {
      return { baseScenario: null, chairScenario: null };
    }
    const { base, chair } = classifyScenarioFromPipeline(
      aggregatedForecast,
      calibration,
    );
    return { baseScenario: base, chairScenario: chair };
  }, [aggregatedForecast, calibration]);

  const chairEnsemble = useMemo(
    () =>
      aggregatedForecast
        ? synthesizeChairEnsemble(aggregatedForecast, calibration)
        : null,
    [aggregatedForecast, calibration],
  );

  const pipelineWeights = useMemo(
    () =>
      aggregatedForecast ? pipelineEnsembleWeightSummary(aggregatedForecast) : [],
    [aggregatedForecast],
  );

  const chairWeights = useMemo(
    () =>
      aggregatedForecast
        ? chairEnsembleWeightSummary(aggregatedForecast, calibration)
        : [],
    [aggregatedForecast, calibration],
  );

  const inputCoverage = useMemo(
    () => scenarioInputCoverage(aggregatedForecast),
    [aggregatedForecast],
  );

  const targetChart = useMemo(
    () =>
      aggregatedForecast && chairEnsemble
        ? buildTargetChartView(
            aggregatedForecast.signals,
            aggregatedForecast.target_series_id,
            aggregatedForecast.data_sources,
            {
              pipelineEnsemble: aggregatedForecast.ensemble?.ensemble_forecast,
              chairEnsemble,
              chairScenario,
            },
          )
        : null,
    [aggregatedForecast, chairEnsemble, chairScenario],
  );

  const scenarioChanged =
    baseScenario && chairScenario && scenariosDiffer(baseScenario, chairScenario);

  const seriesList = useMemo(() => {
    if (!aggregatedForecast?.included_series_ids) return [];
    const target = aggregatedForecast.target_series_id;
    return aggregatedForecast.included_series_ids
      .filter((id) => id !== target && include[id])
      .map((id) =>
        buildSeriesChartView(
          aggregatedForecast.signals[id],
          id,
          aggregatedForecast.data_sources,
        ),
      )
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [aggregatedForecast, include]);

  const active = seriesList[Math.min(activeTab, Math.max(0, seriesList.length - 1))] ?? null;

  const priceWeight = 100 - calibration.mandate;
  const evidenceLabel =
    calibration.risk > 60 ? "Preemptive" : calibration.risk < 35 ? "Cautious" : "Measured";

  if (!aggregatedForecast) {
    return (
      <div className="space-y-4">
        <Eyebrow>Step 04 · Forecast</Eyebrow>
        <p className="text-sm text-muted-foreground">
          No forecast aggregate loaded. Go back and run the processing step with the backend online.
        </p>
        <StudioButton variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </StudioButton>
      </div>
    );
  }

  if (!targetChart) {
    return (
      <div className="space-y-4">
        <Eyebrow>Step 04 · Forecast</Eyebrow>
        <p className="text-sm text-[var(--st-cut)]">
          Could not build a chart for {aggregatedForecast.target_series_id ?? "the target series"}.
          Check that the pipeline returned forecast and input artifacts for that signal.
        </p>
        <StudioButton variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </StudioButton>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <Eyebrow>Step 04 · Forecast</Eyebrow>
        <h1 className="st-display text-4xl text-foreground md:text-5xl">The probable paths</h1>
        <div className="max-w-2xl">
          <StudioNote>
            Ground truth from the submitted FRED series,{" "}
            <span className="font-medium text-foreground">held-out backtest medians (p50)</span>, and forward quantile
            fans for{" "}
            <span className="st-mono font-medium text-foreground">
              {aggregatedForecast.included_series_ids?.join(", ")}
            </span>
            .
          </StudioNote>
        </div>
      </div>

      <Card className="gap-0 py-5">
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <LineChart className="size-4 text-[var(--st-brand)]" />
              <span className="text-sm font-medium text-foreground">Forecasts · per signal</span>
            </div>
            {seriesList.length > 0 && (
              <ToggleGroup
                type="single"
                variant="outline"
                value={String(activeTab)}
                onValueChange={(v) => v && setActiveTab(Number(v))}
              >
                {seriesList.map((s, i) => (
                  <ToggleGroupItem key={s.seriesId} value={String(i)} className="st-mono text-[11px]">
                    {s.seriesId}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </div>

          {active ? (
            <>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-medium text-foreground">{active.title}</span>
                <span className="st-mono text-[11px] text-muted-foreground">
                  last observed {fmtVal(active.history[active.history.length - 1]?.v ?? 0, active)} →
                  horizon p50 {fmtVal(active.band[active.band.length - 1]?.p50 ?? 0, active)}
                </span>
              </div>
              <FanChart
                key={active.seriesId}
                history={active.history}
                band={active.band}
                horizonMonths={calibration.horizon}
                unit={active.unit}
                decimals={active.decimals}
                historyLabel="Ground truth (FRED)"
                backtest={active.backtest}
                yDomain={active.yDomain}
              />
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{active.read}</p>
            </>
          ) : (
            <p className="py-10 text-center text-[13px] text-muted-foreground">
              No other signals selected — only the policy target is shown below.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="gap-0 py-5">
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Policy rate · quantile fan</span>
                <Pill tone="brand">{aggregatedForecast.target_series_id ?? "FEDFUNDS"}</Pill>
              </div>
            </div>
            {chairScenario && (
              <div className="mb-4 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <ScenarioChip
                    label="Baseline"
                    scenario={
                      baseScenario ? SCENARIO_DISPLAY_LABEL[baseScenario.scenario] : "—"
                    }
                    confidence={baseScenario?.confidence}
                    delta={baseScenario?.delta_3m}
                    color="var(--st-muted)"
                  />
                  <ScenarioChip
                    label="Chair-adjusted"
                    scenario={SCENARIO_DISPLAY_LABEL[chairScenario.scenario]}
                    confidence={chairScenario.confidence}
                    delta={chairScenario.delta_3m}
                    color={targetChart.scenarioColor || "var(--st-foreground)"}
                    info={
                      <EnsembleHoverBody
                        pipelineWeights={pipelineWeights}
                        chairWeights={chairWeights}
                      />
                    }
                  />
                </div>
                {scenarioChanged && baseScenario && (
                  <p className="rounded-md border border-[var(--st-brand)]/40 bg-[var(--st-brand)]/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-foreground">
                    Re-weighting flips the call:{" "}
                    <span className="st-mono">
                      {SCENARIO_DISPLAY_LABEL[baseScenario.scenario]}
                    </span>{" "}
                    → {" "}
                    <span className="st-mono">
                      {SCENARIO_DISPLAY_LABEL[chairScenario.scenario]}
                    </span>{" "}
                    ({formatPp(baseScenario.delta_3m)} → {formatPp(chairScenario.delta_3m)}).
                  </p>
                )}
                {inputCoverage.ensembleIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">Blend</span>
                    <span className="st-mono text-foreground">
                      {inputCoverage.ensembleIds.join(" · ")}
                    </span>
                    <InfoHover>
                      <ScenarioInputsHoverBody coverage={inputCoverage} />
                    </InfoHover>
                  </div>
                )}
              </div>
            )}
            <FanChart
              history={targetChart.history}
              band={targetChart.band}
              horizonMonths={calibration.horizon}
              unit={targetChart.unit}
              decimals={targetChart.decimals}
              historyLabel="Ground truth (FRED)"
              backtest={targetChart.backtest}
              baselineScenarioPath={targetChart.baselineScenarioPath}
              baselineScenarioLegend={targetChart.baselineScenarioLegend}
              scenarioPath={targetChart.scenarioPath}
              scenarioColor={targetChart.scenarioColor}
              scenarioLegend={targetChart.scenarioLegend}
              yDomain={targetChart.yDomain}
            />
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{targetChart.read}</p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="gap-0 py-5">
            <CardContent>
              <div className="flex items-center gap-2">
                <Scale className="size-4 text-[var(--st-brand)]" />
                <span className="text-sm font-medium text-foreground">Your reaction function</span>
              </div>
              <ReactionFunctionExplainer
                pipelineWeights={pipelineWeights}
                chairWeights={chairWeights}
                mandate={calibration.mandate}
                risk={calibration.risk}
                inflationTolerance={calibration.inflationTolerance}
              />

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
                />
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <StudioButton variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </StudioButton>
        <StudioButton onClick={onNext}>
          Synthesise the decision <ArrowRight className="size-4" />
        </StudioButton>
      </div>
    </div>
  );
}

function fmtVal(v: number, s: { unit: string; decimals: number }): string {
  return `${v.toFixed(s.decimals)}${s.unit}`;
}

function formatPp(v: number): string {
  return `${v >= 0 ? "+" : ""}${v}pp`;
}

function formatWeightRow(rows: { seriesId: string; pct: number }[]): string {
  return rows.map((w) => `${w.seriesId} ${w.pct}%`).join(" · ");
}

function ReactionFunctionExplainer({
  pipelineWeights,
  chairWeights,
  mandate,
  risk,
  inflationTolerance,
}: {
  pipelineWeights: { seriesId: string; role: string; pct: number }[];
  chairWeights: { seriesId: string; role: string; pct: number }[];
  mandate: number;
  risk: number;
  inflationTolerance: number;
}) {
  return (
    <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium text-foreground">Live blend weights</span>
        <InfoHover>
          <ReactionHoverBody
            mandate={mandate}
            risk={risk}
            inflationTolerance={inflationTolerance}
          />
        </InfoHover>
      </div>
      {chairWeights.length > 0 && (
        <p className="st-mono mt-1.5 text-[10.5px] text-foreground">{formatWeightRow(chairWeights)}</p>
      )}
      {pipelineWeights.length > 0 && (
        <p className="st-mono mt-1 text-[10px] text-muted-foreground">
          baseline · {formatWeightRow(pipelineWeights)}
        </p>
      )}
    </div>
  );
}

function ReactionHoverBody({
  mandate,
  risk,
  inflationTolerance,
}: {
  mandate: number;
  risk: number;
  inflationTolerance: number;
}) {
  const jobsLean = mandate > 55;
  const priceLean = mandate < 45;
  return (
    <div className="space-y-2 text-[12px] leading-relaxed text-muted-foreground">
      <p className="font-medium text-foreground">How sliders change the forecast</p>
      <p>
        Sybilion runs once per series. Sliders don&apos;t re-run models or move the blue FEDFUNDS
        fan — they only change how much each series&apos; forward median counts when blending a
        policy-rate path.
      </p>
      <ul className="list-inside list-disc space-y-1 pl-0.5">
        <li>
          <span className="font-medium text-foreground">Dual-mandate</span> — weight toward labor (
          {jobsLean ? "stronger now" : "weaker"}) vs inflation ({priceLean ? "stronger now" : "weaker"}).
        </li>
        <li>
          <span className="font-medium text-foreground">Evidence threshold</span> —{" "}
          {risk > 55
            ? "preemptive: more leading / market (DGS2)"
            : risk < 40
              ? "cautious: more FEDFUNDS anchor"
              : "balanced market vs target mix"}
          .
        </li>
        <li>
          <span className="font-medium text-foreground">Inflation tolerance</span> — +
          {inflationTolerance.toFixed(1)}pp nudges weight on the inflation series.
        </li>
      </ul>
    </div>
  );
}

function InfoHover({ children }: { children: ReactNode }) {
  return (
    <HoverCard openDelay={80} closeDelay={60}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label="More detail"
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <CircleHelp className="size-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80">
        {children}
      </HoverCardContent>
    </HoverCard>
  );
}

function ScenarioChip({
  label,
  scenario,
  confidence,
  delta,
  color,
  info,
}: {
  label: string;
  scenario: string;
  confidence?: string;
  delta?: number;
  color: string;
  info?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between gap-1">
        <Eyebrow style={{ fontSize: 9 }}>{label}</Eyebrow>
        {info ? <InfoHover>{info}</InfoHover> : null}
      </div>
      <div className="mt-1 truncate text-[15px] font-medium leading-tight" style={{ color }}>
        {scenario}
      </div>
      <div className="st-mono mt-0.5 text-[10.5px] text-muted-foreground">
        {confidence ? `${confidence} conf` : "—"}
        {delta != null && ` · Δ3m ${formatPp(delta)}`}
      </div>
    </div>
  );
}

function EnsembleHoverBody({
  pipelineWeights,
  chairWeights,
}: {
  pipelineWeights: { seriesId: string; pct: number }[];
  chairWeights: { seriesId: string; pct: number }[];
}) {
  return (
    <div className="space-y-2 text-[12px] leading-relaxed text-muted-foreground">
      <div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-5 border-t-2 border-dashed"
            style={{ borderColor: "var(--st-muted)" }}
          />
          <span className="font-medium text-foreground">Baseline (gray dashed)</span>
        </div>
        <p className="mt-1">
          Weighted average of each series&apos; Sybilion median using fixed catalog weights.
          Stays put when you move sliders.
        </p>
        {pipelineWeights.length > 0 && (
          <p className="st-mono mt-1 text-[10.5px] text-foreground">
            {formatWeightRow(pipelineWeights)}
          </p>
        )}
      </div>
      <div className="border-t border-border pt-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-5 border-t-2"
            style={{ borderColor: "var(--st-brand)" }}
          />
          <span className="font-medium text-foreground">Chair (colored solid)</span>
        </div>
        <p className="mt-1">
          Same medians, re-blended with your slider weights. The scenario label and chart color
          follow this path.
        </p>
        {chairWeights.length > 0 && (
          <p className="st-mono mt-1 text-[10.5px] text-foreground">
            {formatWeightRow(chairWeights)}
          </p>
        )}
      </div>
    </div>
  );
}

function ScenarioInputsHoverBody({
  coverage,
}: {
  coverage: ReturnType<typeof scenarioInputCoverage>;
}) {
  return (
    <div className="space-y-2 text-[11.5px] leading-relaxed text-muted-foreground">
      <p className="font-medium text-foreground">Scenario classifier roles</p>
      <ul className="space-y-1">
        {coverage.roleRows.map((row) => (
          <li key={row.label} className="flex flex-wrap items-baseline gap-x-1.5">
            <span
              className="st-mono font-medium"
              style={{ color: row.active ? "var(--st-brand)" : "var(--st-muted)" }}
            >
              {row.active ? "✓" : "—"}
            </span>
            <span className="text-foreground">{row.label}</span>
            {row.seriesId ? (
              <span className="st-mono text-foreground">{row.seriesId}</span>
            ) : (
              <span className="italic">not selected</span>
            )}
            <span className="w-full text-[10px] sm:w-auto">({row.ruleHint})</span>
          </li>
        ))}
      </ul>
      {coverage.droppedIds.length > 0 && (
        <p className="text-[var(--st-cut)]">
          Excluded (failed/empty):{" "}
          <span className="st-mono">{coverage.droppedIds.join(" · ")}</span>
        </p>
      )}
      {coverage.contextInBlendOnly.length > 0 && (
        <p>
          In blend only (no classifier rule):{" "}
          <span className="st-mono">{coverage.contextInBlendOnly.join(" · ")}</span>
        </p>
      )}
      <p className="border-t border-border pt-1.5 text-[10.5px]">
        Δ3m / Δ6m always come from the blended ensemble path. Change inputs on Step 02 and re-run
        to alter the blend.
      </p>
    </div>
  );
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
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-[12.5px] text-foreground/80">{label}</Label>
        <span className="st-mono text-[11px] text-[var(--st-brand)]">{value}</span>
      </div>
      <Slider
        className="mt-2"
        min={min}
        max={max}
        step={step}
        value={[current]}
        onValueChange={(v) => onChange(v[0])}
        aria-label={label}
      />
      <div className="mt-0.5 flex justify-between text-[10.5px] text-muted-foreground">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}
