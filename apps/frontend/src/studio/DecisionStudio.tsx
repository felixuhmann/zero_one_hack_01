import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, MessageSquareIcon } from "lucide-react";

import type { PipelineResponse } from "@/types/forecast";
import {
  DEFAULT_CALIBRATION,
  PROPOSED_SOURCES,
  type CalibrationState,
} from "@/studio/data";
import { AgentAvatar } from "@/studio/ui/bits";
import { CountrySelect } from "@/studio/steps/CountrySelect";
import { DataSources } from "@/studio/steps/DataSources";
import { Processing } from "@/studio/steps/Processing";
import { ForecastReview } from "@/studio/steps/ForecastReview";
import { Recommendation } from "@/studio/steps/Recommendation";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import "@/studio/studio.css";

export type StepId = "country" | "sources" | "processing" | "forecast" | "recommendation";

const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: "country", label: "Jurisdiction", hint: "Pick a central bank" },
  { id: "sources", label: "Data sources", hint: "Approve the inputs" },
  { id: "processing", label: "Forecasting", hint: "Sybilion runs" },
  { id: "forecast", label: "Forecast", hint: "Read the probabilities" },
  { id: "recommendation", label: "Decision", hint: "Tune & act on it" },
];

export interface DecisionStudioProps {
  onOpenChat?: () => void;
}

export function DecisionStudio({ onOpenChat }: DecisionStudioProps) {
  const [step, setStep] = useState<StepId>("country");
  const [country, setCountry] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<CalibrationState>(DEFAULT_CALIBRATION);
  const [include, setInclude] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PROPOSED_SOURCES.map((s) => [s.seriesId, s.recommended])),
  );
  const [forecast, setForecast] = useState<PipelineResponse | null>(null);

  const reached = useMemo(() => {
    const order = STEPS.map((s) => s.id);
    return order.indexOf(step);
  }, [step]);

  function go(next: StepId) {
    setStep(next);
  }

  function canVisit(id: StepId): boolean {
    const order = STEPS.map((s) => s.id);
    return order.indexOf(id) <= reached;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="studio-root flex h-svh min-h-svh flex-col overflow-hidden bg-background text-foreground">
        {/* top bar */}
        <header className="flex shrink-0 items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-3">
            <AgentAvatar size={30} />
            <div className="leading-tight">
              <div className="st-display text-lg text-foreground">Policy Decision Studio</div>
              <div className="st-eyebrow" style={{ fontSize: 9 }}>
                Sybilion · forecast-driven rate guidance
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="hidden font-mono md:inline-flex">
              prototype · mock data
            </Badge>
            {onOpenChat && (
              <Button onClick={onOpenChat} size="sm" variant="outline">
                <MessageSquareIcon data-icon="inline-start" />
                Chat
              </Button>
            )}
            <ModeToggle />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* step rail */}
          <nav className="hidden w-[230px] shrink-0 flex-col gap-1 border-r p-4 lg:flex">
            {STEPS.map((s, i) => {
              const active = s.id === step;
              const done = i < reached;
              const visitable = canVisit(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!visitable}
                  onClick={() => visitable && go(s.id)}
                  className={cn(
                    "st-focus-ring group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "st-mono grid size-7 shrink-0 place-items-center rounded-full border text-[11px] transition-all",
                      active
                        ? "border-transparent bg-[var(--st-brand)] text-[var(--st-bg-deep)]"
                        : done
                          ? "border-transparent bg-[var(--st-brand-dim)] text-[var(--st-bg-deep)]"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-[13px] font-medium",
                        active ? "text-foreground" : visitable ? "text-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{s.hint}</span>
                  </span>
                </button>
              );
            })}
            <div className="mt-auto rounded-lg border bg-card p-3">
              <div className="st-eyebrow mb-1" style={{ fontSize: 9 }}>
                live demo ready
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The decision step accepts a mid-run assumption shift and re-derives the call in real time.
              </p>
            </div>
          </nav>

          {/* content */}
          <main className="min-w-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className={step === "country" ? "relative h-full" : "mx-auto w-full max-w-6xl px-6 py-8"}
              >
                {step === "country" && (
                  <CountrySelect
                    selected={country}
                    onSelect={(c) => setCountry(c)}
                    onNext={() => go("sources")}
                  />
                )}
                {step === "sources" && (
                  <DataSources
                    include={include}
                    setInclude={setInclude}
                    calibration={calibration}
                    onBack={() => go("country")}
                    onNext={() => go("processing")}
                  />
                )}
                {step === "processing" && (
                  <Processing
                    include={include}
                    onForecastReady={setForecast}
                    onDone={() => go("forecast")}
                  />
                )}
                {step === "forecast" && (
                  <ForecastReview
                    calibration={calibration}
                    onCalibrationChange={setCalibration}
                    include={include}
                    aggregatedForecast={forecast}
                    onBack={() => go("sources")}
                    onNext={() => go("recommendation")}
                  />
                )}
                {step === "recommendation" && (
                  <Recommendation
                    calibration={calibration}
                    onBack={() => go("forecast")}
                    onRestart={() => {
                      setStep("country");
                      setCountry(null);
                      setForecast(null);
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
