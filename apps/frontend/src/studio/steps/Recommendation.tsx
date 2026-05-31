import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, RotateCcw, Sliders } from "lucide-react";

import { assumptionsFromForecast } from "@/lib/forecastAssumptions";
import { deriveNextMeetingDecision } from "@/lib/nextMeetingDecision";
import { SCENARIO_DISPLAY_LABEL } from "@/lib/scenarioChart";
import { classifyScenarioFromPipeline, scenariosDiffer } from "@/lib/scenarioClassifier";
import type { PipelineResponse } from "@/types/forecast";
import {
  defaultAssumptions,
  type Assumption,
  type CalibrationState,
  type Decision,
} from "@/studio/data";
import { DecisionGauge } from "@/studio/charts/DecisionGauge";
import { Eyebrow, Pill, StudioButton, StudioNote } from "@/studio/ui/bits";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Props {
  calibration: CalibrationState;
  aggregatedForecast?: PipelineResponse | null;
  onBack: () => void;
  onRestart: () => void;
}

const DECISION_TONE: Record<Decision, "cut" | "hold" | "hike"> = {
  cut: "cut",
  hold: "hold",
  hike: "hike",
};

const SCENARIOS: { id: string; label: string; apply: (a: Assumption[]) => Assumption[]; note: string }[] = [
  { id: "base", label: "Baseline", apply: () => defaultAssumptions(), note: "Reset to the current data: core PCE 3.0%, unemployment 4.4%, market pricing ~1.3 cuts." },
  {
    id: "labor",
    label: "Labor shock",
    apply: (a) => a.map((x) => (x.id === "unrate" ? { ...x, value: 5.4 } : x.id === "marketcuts" ? { ...x, value: -90 } : x)),
    note: "Unemployment jumps to 5.4% and the curve prices 90 bps of cuts. The employment mandate now dominates — this should flip the call.",
  },
  {
    id: "inflation",
    label: "Inflation re-accelerates",
    apply: (a) => a.map((x) => (x.id === "corepce" ? { ...x, value: 3.9 } : x)),
    note: "Core PCE re-accelerates to 3.9%. The price-stability side reasserts and the easing bias should fade.",
  },
  {
    id: "unanchor",
    label: "Expectations un-anchor",
    apply: (a) => a.map((x) => (x.id === "expectations" ? { ...x, value: 3.1 } : x)),
    note: "Long-run expectations drift to 3.1%. Per the 2025 framework, policy should act forcefully to re-anchor — this overrides activity data.",
  },
];

export function Recommendation({
  calibration,
  aggregatedForecast,
  onBack,
  onRestart,
}: Props) {
  const [assumptions, setAssumptions] = useState<Assumption[]>(() =>
    assumptionsFromForecast(aggregatedForecast),
  );

  useEffect(() => {
    setAssumptions(assumptionsFromForecast(aggregatedForecast));
  }, [aggregatedForecast]);

  const [activeScenario, setActiveScenario] = useState("base");
  const [scenarioNote, setScenarioNote] = useState<string | null>(null);

  const { base: pipelineScenario, chair: chairScenario } = useMemo(() => {
    if (!aggregatedForecast) return { base: null, chair: null };
    return classifyScenarioFromPipeline(aggregatedForecast, calibration);
  }, [aggregatedForecast, calibration]);

  const result = useMemo(
    () => deriveNextMeetingDecision(aggregatedForecast, calibration, assumptions, chairScenario),
    [aggregatedForecast, calibration, assumptions, chairScenario],
  );

  const maxContrib = Math.max(...result.contributions.map((c) => Math.abs(c.value)), 8);

  const scenarioFlipped =
    pipelineScenario &&
    chairScenario &&
    scenariosDiffer(pipelineScenario, chairScenario);

  function setAssumption(id: string, value: number) {
    setAssumptions((prev) => prev.map((a) => (a.id === id ? { ...a, value } : a)));
    setActiveScenario("custom");
    setScenarioNote(null);
  }

  function applyScenario(id: string) {
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    setAssumptions(s.apply(assumptionsFromForecast(aggregatedForecast)));
    setActiveScenario(s.id);
    setScenarioNote(s.note);
  }

  const tone = DECISION_TONE[result.decision];

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <Eyebrow>Step 05 · Decision</Eyebrow>
        <h1 className="st-display text-4xl text-foreground md:text-5xl">The recommendation</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          The call <em>is</em> the chair-weighted ensemble path's first move from the forecast step,
          rounded to a 25 bp policy increment. The bars below decompose that move by signal; shifting
          an assumption layers a macro surprise vs the forecast on top and the call adapts.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.25fr] lg:items-stretch">
        <Card className="relative h-full gap-0 py-0">
            <div className="st-grain pointer-events-none absolute inset-0" />
            <CardContent className="relative p-6">
              <div className="flex items-center justify-between">
                <Eyebrow>Next-meeting call · June 2026</Eyebrow>
                <Pill tone={result.confidence === "high" ? "brand" : result.confidence === "medium" ? "hold" : "neutral"}>
                  {result.confidence} confidence
                </Pill>
              </div>

              <div className="mt-4 flex items-end gap-3">
                <span className="st-display text-5xl" style={{ color: `var(--st-${tone})` }}>
                  {result.decision === "hold" ? "Hold" : result.decision === "cut" ? "Cut" : "Hike"}
                </span>
                {result.bps !== 0 && (
                  <span className="st-mono mb-1 text-2xl" style={{ color: `var(--st-${tone})` }}>
                    {result.bps > 0 ? "+" : ""}
                    {result.bps} bps
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">{result.headline}</p>
              {result.headlineDetail && (
                <p className="st-mono mt-1 text-[11px] text-muted-foreground/80">{result.headlineDetail}</p>
              )}

              {chairScenario && (
                <div className="mt-3 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Scenario classifier (3–6m trend): </span>
                  {SCENARIO_DISPLAY_LABEL[chairScenario.scenario]} · Δ3m{" "}
                  {chairScenario.delta_3m >= 0 ? "+" : ""}
                  {chairScenario.delta_3m}pp
                  {pipelineScenario && scenarioFlipped && (
                    <span>
                      {" "}
                      (was {SCENARIO_DISPLAY_LABEL[pipelineScenario.scenario]} on pipeline ensemble)
                    </span>
                  )}
                </div>
              )}

              <div className="my-5">
                <DecisionGauge tilt={result.tilt} referenceTilt={result.referenceTilt} />
              </div>

              <div className="rounded-lg bg-muted p-3">
                <Eyebrow className="mb-1" style={{ fontSize: 9 }}>
                  anticipated dissent
                </Eyebrow>
                <p className="text-[12px] leading-relaxed text-foreground/80">{result.dissent}</p>
              </div>
            </CardContent>
          </Card>

        <Card className="h-full gap-0 py-0">
          <CardContent className="flex h-full flex-col p-6">
            <span className="text-sm font-medium text-foreground">Why — contribution to the next-meeting move</span>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Blue = dovish (cut), red = hawkish (hike). Bars sum to the call in basis points.
            </p>
            <div className="mt-4 flex flex-1 flex-col justify-between gap-3">
              {result.contributions.map((c) => (
                <ContribRow
                  key={c.label}
                  label={c.label}
                  value={c.value}
                  detail={c.detail}
                  max={maxContrib}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-5">
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sliders className="size-4 text-[var(--st-brand)]" />
              <span className="text-sm font-medium text-foreground">Shift an assumption — watch the call adapt</span>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={activeScenario}
              onValueChange={(v) => v && applyScenario(v)}
            >
              {SCENARIOS.map((s) => (
                <ToggleGroupItem key={s.id} value={s.id} className="text-[12px]">
                  {s.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <AnimatePresence>
            {scenarioNote && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3">
                <StudioNote>{scenarioNote}</StudioNote>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {assumptions.map((a) => (
              <AssumptionSlider key={a.id} a={a} onChange={(v) => setAssumption(a.id, v)} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between pt-2">
        <StudioButton variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back to forecast
        </StudioButton>
        <StudioButton variant="outline" onClick={onRestart}>
          <RotateCcw className="size-4" /> New session
        </StudioButton>
      </div>
    </div>
  );
}

function ContribRow({
  label,
  value,
  detail,
  max,
}: {
  label: string;
  value: number;
  detail: string;
  max: number;
}) {
  const pct = (Math.abs(value) / max) * 50;
  const dovish = value < 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12.5px] text-foreground/80">{label}</span>
        <span className="st-mono text-[11px]" style={{ color: dovish ? "var(--st-cut)" : "var(--st-hike)" }}>
          {value >= 0 ? "+" : ""}
          {Math.round(value)} bp
        </span>
      </div>
      <div className="relative h-3.5 w-full rounded-full" style={{ background: "var(--st-line)" }}>
        <div className="absolute left-1/2 top-0 h-full w-px" style={{ background: "var(--st-line-strong)" }} />
        <motion.div
          layout
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
          className="absolute top-0 h-full rounded-full"
          style={{
            right: dovish ? "50%" : undefined,
            left: dovish ? undefined : "50%",
            background: dovish ? "var(--st-cut)" : "var(--st-hike)",
          }}
        />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{detail}</p>
    </div>
  );
}

function AssumptionSlider({ a, onChange }: { a: Assumption; onChange: (v: number) => void }) {
  const moved = a.value !== a.baseline;
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-[12.5px] text-foreground/80">{a.label}</Label>
        <span className="st-mono text-[12px]" style={{ color: moved ? "var(--st-brand)" : "var(--st-muted)" }}>
          {a.value > 0 && a.unit === "bps" ? "+" : ""}
          {a.value.toFixed(a.step < 1 ? 1 : 0)} {a.unit}
        </span>
      </div>
      <Slider
        className="mt-2"
        min={a.min}
        max={a.max}
        step={a.step}
        value={[a.value]}
        onValueChange={(v) => onChange(v[0])}
        aria-label={a.label}
      />
      <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{a.hint}</p>
    </div>
  );
}
