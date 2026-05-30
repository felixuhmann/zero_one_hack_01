import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, LineChart, Scale } from "lucide-react";

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
import { Eyebrow, Pill, StatBlock, StudioButton, StudioNote } from "@/studio/ui/bits";
import { Card, CardContent } from "@/components/ui/card";
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
  const [horizon, setHorizon] = useState<3 | 6>(calibration.horizon);
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

  const hp = targetChart?.band[Math.min(horizon, targetChart.band.length - 1)];
  const seam = targetChart?.band[0];
  const currentRate = seam?.history ?? seam?.p50 ?? 0;
  const medianDelta = hp ? hp.p50 - currentRate : 0;
  const rangeWidth = hp ? hp.p95 - hp.p05 : 0;
  const impliedCuts = Math.max(0, Math.round(-medianDelta / 0.25));
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
                horizonMonths={horizon}
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
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={String(horizon)}
                onValueChange={(v) => v && setHorizon(Number(v) as 3 | 6)}
              >
                {([3, 6] as const).map((h) => (
                  <ToggleGroupItem key={h} value={String(h)} className="st-mono text-[11px]">
                    {h}M
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {chairScenario && (
              <div className="mb-3 space-y-2 text-[12px] leading-relaxed text-muted-foreground">
                <p>
                  Ensemble (baseline):{" "}
                  <span className="font-medium text-foreground">
                    {baseScenario
                      ? SCENARIO_DISPLAY_LABEL[baseScenario.scenario]
                      : "—"}
                  </span>
                  {baseScenario && (
                    <>
                      {" · "}
                      {baseScenario.confidence} confidence · Δ3m{" "}
                      {baseScenario.delta_3m >= 0 ? "+" : ""}
                      {baseScenario.delta_3m}pp
                    </>
                  )}
                </p>
                <p>
                  Chair-adjusted:{" "}
                  <span
                    className="font-medium"
                    style={{ color: targetChart.scenarioColor || "var(--st-foreground)" }}
                  >
                    {SCENARIO_DISPLAY_LABEL[chairScenario.scenario]}
                  </span>
                  {" · "}
                  {chairScenario.confidence} confidence · Δ3m{" "}
                  {chairScenario.delta_3m >= 0 ? "+" : ""}
                  {chairScenario.delta_3m}pp
                </p>
                {scenarioChanged && (
                  <p className="rounded-md border border-[var(--st-brand)]/40 bg-[var(--st-brand)]/10 px-2 py-1.5 text-foreground">
                    Re-weighting shifts the ensemble path and scenario from{" "}
                    <span className="st-mono">
                      {baseScenario && SCENARIO_DISPLAY_LABEL[baseScenario.scenario]}
                    </span>{" "}
                    (Δ3m {baseScenario && formatPp(baseScenario.delta_3m)}) to{" "}
                    <span className="st-mono">
                      {SCENARIO_DISPLAY_LABEL[chairScenario.scenario]}
                    </span>{" "}
                    (Δ3m {formatPp(chairScenario.delta_3m)}).
                  </p>
                )}
              </div>
            )}
            <ScenarioInputsExplainer coverage={inputCoverage} />
            <EnsemblePathExplainer
              pipelineWeights={pipelineWeights}
              chairWeights={chairWeights}
            />
            <FanChart
              history={targetChart.history}
              band={targetChart.band}
              horizonMonths={horizon}
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

          {hp && (
            <Card className="gap-0 py-5">
              <CardContent className="grid grid-cols-2 gap-4">
                <StatBlock
                  label={`Median @ ${horizon}M`}
                  value={`${hp.p50.toFixed(targetChart.decimals)}${targetChart.unit}`}
                  tone="brand"
                  sub={`${medianDelta >= 0 ? "+" : ""}${(medianDelta * 100).toFixed(0)} bps`}
                />
                <StatBlock
                  label="90% band width"
                  value={`${(rangeWidth * 100).toFixed(0)}`}
                  sub="bps of uncertainty"
                />
                <StatBlock label="Implied cuts" value={impliedCuts} sub="× 25 bps priced" tone="cut" />
                <StatBlock
                  label="p05 / p95"
                  value={`${hp.p05.toFixed(targetChart.decimals)}–${hp.p95.toFixed(targetChart.decimals)}`}
                  sub="tail outcomes"
                />
              </CardContent>
            </Card>
          )}
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
  const jobsLean = mandate > 55;
  const priceLean = mandate < 45;

  return (
    <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
      <p className="font-medium text-foreground">How sliders change the forecast</p>
      <p>
        Sybilion runs once per series. Sliders do <span className="font-medium text-foreground">not</span>{" "}
        re-run models or move the blue FEDFUNDS fan — they only change how much each series&apos;s{" "}
        <span className="font-medium text-foreground">forward median</span> counts when blending a policy-rate path.
      </p>
      <ul className="list-inside list-disc space-y-1 pl-0.5">
        <li>
          <span className="font-medium text-foreground">Dual-mandate</span> — shifts weight toward labor (
          {jobsLean ? "stronger now" : "weaker"}) vs inflation ({priceLean ? "stronger now" : "weaker"}).
        </li>
        <li>
          <span className="font-medium text-foreground">Evidence threshold</span> —{" "}
          {risk > 55 ? "preemptive: more leading / market (DGS2)" : risk < 40 ? "cautious: more FEDFUNDS anchor" : "balanced market vs target mix"}.
        </li>
        <li>
          <span className="font-medium text-foreground">Inflation tolerance</span> — +{inflationTolerance.toFixed(1)}pp
          nudges weight on the inflation series.
        </li>
      </ul>
      {pipelineWeights.length > 0 && (
        <p className="st-mono text-[10px]">
          Baseline blend (fixed catalog): {formatWeightRow(pipelineWeights)}
        </p>
      )}
      {chairWeights.length > 0 && (
        <p className="st-mono text-[10px]">
          Chair blend (sliders applied): {formatWeightRow(chairWeights)}
        </p>
      )}
    </div>
  );
}

function ScenarioInputsExplainer({
  coverage,
}: {
  coverage: ReturnType<typeof scenarioInputCoverage>;
}) {
  if (!coverage.roleRows.length && !coverage.ensembleIds.length) return null;

  return (
    <div className="mb-3 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
      <p className="font-medium text-foreground">Inputs for this run (Step 02 selection)</p>
      <p className="mt-1">
        <span className="font-medium text-foreground">Ensemble blend</span>
        {coverage.ensembleIds.length ? (
          <>
            :{" "}
            <span className="st-mono text-foreground">{coverage.ensembleIds.join(" · ")}</span>
            <span className="text-muted-foreground"> — each series&apos;s forward median is weighted in.</span>
          </>
        ) : (
          " — no valid forecasts in the aggregate."
        )}
      </p>
      {coverage.droppedIds.length > 0 && (
        <p className="mt-1 text-[var(--st-cut)]">
          Excluded from blend (failed or empty):{" "}
          <span className="st-mono">{coverage.droppedIds.join(" · ")}</span>
        </p>
      )}
      <p className="mt-2 font-medium text-foreground">Scenario classifier</p>
      <ul className="mt-1 space-y-1">
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
              <span className="italic">not in selection</span>
            )}
            <span className="w-full text-[10px] text-muted-foreground sm:w-auto">({row.ruleHint})</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[10px]">
        Δ3m / Δ6m always come from the blended ensemble path. Tabs above only hide charts — change inputs on
        Step 02 and re-run to alter the blend.
      </p>
      {coverage.contextInBlendOnly.length > 0 && (
        <p className="mt-1.5 text-[10px]">
          In ensemble only (no classifier rule):{" "}
          <span className="st-mono">{coverage.contextInBlendOnly.join(" · ")}</span>
        </p>
      )}
    </div>
  );
}

function EnsemblePathExplainer({
  pipelineWeights,
  chairWeights,
}: {
  pipelineWeights: { seriesId: string; pct: number }[];
  chairWeights: { seriesId: string; pct: number }[];
}) {
  return (
    <div className="mb-3 rounded-md border border-dashed border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">Gray dashed</span> — baseline ensemble: weighted average of
        each series&apos;s Sybilion median using{" "}
        <span className="font-medium text-foreground">fixed catalog weights</span> from the pipeline
        {pipelineWeights.length > 0 ? ` (${formatWeightRow(pipelineWeights)})` : ""}. Unchanged when you move sliders.
      </p>
      <p className="mt-1.5">
        <span className="font-medium text-foreground">Colored solid</span> — chair ensemble: same medians,
        re-blended with slider-adjusted weights
        {chairWeights.length > 0 ? ` (${formatWeightRow(chairWeights)})` : ""}. Scenario label and color follow this path.
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
