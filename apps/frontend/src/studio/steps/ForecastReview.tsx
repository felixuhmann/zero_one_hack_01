import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, LineChart, Scale } from "lucide-react";

import { TEMPERAMENTS, type CalibrationState } from "@/studio/data";
import type { PipelineResponse } from "@/types/forecast";
import { buildSeriesChartView, buildTargetChartView } from "@/lib/sybilionCharts";
import { FanChart } from "@/studio/charts/FanChart";
import { AgentBubble, Eyebrow, Pill, StatBlock, StudioButton } from "@/studio/ui/bits";
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
  const [horizon, setHorizon] = useState<3 | 6 | 12>(calibration.horizon);
  const [activeTab, setActiveTab] = useState(0);

  const setCal = <K extends keyof CalibrationState>(k: K, v: CalibrationState[K]) =>
    onCalibrationChange({ ...calibration, [k]: v });

  const targetChart = useMemo(
    () =>
      aggregatedForecast
        ? buildTargetChartView(
            aggregatedForecast.signals,
            aggregatedForecast.target_series_id,
            aggregatedForecast.data_sources,
          )
        : null,
    [aggregatedForecast],
  );

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
          No Sybilion aggregate loaded. Go back and run the processing step with the backend online.
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
          Check that Sybilion returned forecast and input artifacts for that signal.
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
          <AgentBubble>
            Ground truth from the submitted FRED series,{" "}
            <span className="font-medium text-foreground">held-out backtest medians (p50)</span>, and
            forward quantile fans from Sybilion for{" "}
            <span className="st-mono font-medium text-foreground">
              {aggregatedForecast.included_series_ids?.join(", ")}
            </span>
            .
          </AgentBubble>
        </div>
      </div>

      <Card className="gap-0 py-5">
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <LineChart className="size-4 text-[var(--st-brand)]" />
              <span className="text-sm font-medium text-foreground">Sybilion forecasts · per signal</span>
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
                <span className="text-sm font-medium text-foreground">Policy rate · Sybilion fan</span>
                <Pill tone="brand">{aggregatedForecast.target_series_id ?? "FEDFUNDS"}</Pill>
              </div>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={String(horizon)}
                onValueChange={(v) => v && setHorizon(Number(v) as 3 | 6 | 12)}
              >
                {([3, 6, 12] as const).map((h) => (
                  <ToggleGroupItem key={h} value={String(h)} className="st-mono text-[11px]">
                    {h}M
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <FanChart
              history={targetChart.history}
              band={targetChart.band}
              horizonMonths={horizon}
              unit={targetChart.unit}
              decimals={targetChart.decimals}
              historyLabel="Ground truth (FRED)"
              backtest={targetChart.backtest}
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
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Calibration for the decision step — chart shows Sybilion output as returned
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
                <div>
                  <Label className="text-[12.5px] text-foreground/80">Reaction temperament</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={0}
                    value={calibration.temperament}
                    onValueChange={(v) => v && setCal("temperament", v)}
                    className="mt-2 grid w-full grid-cols-3"
                  >
                    {TEMPERAMENTS.map((t) => (
                      <ToggleGroupItem
                        key={t.id}
                        value={t.id}
                        title={t.blurb}
                        className="h-auto whitespace-normal py-2 text-center text-[11px]"
                      >
                        {t.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
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
