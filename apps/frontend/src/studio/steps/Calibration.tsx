import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Scale } from "lucide-react";

import { TEMPERAMENTS, type CalibrationState } from "@/studio/data";
import { AgentBubble, Eyebrow, StudioButton } from "@/studio/ui/bits";

interface Props {
  value: CalibrationState;
  onChange: (v: CalibrationState) => void;
  onBack: () => void;
  onNext: () => void;
}

export function Calibration({ value, onChange, onBack, onNext }: Props) {
  const set = <K extends keyof CalibrationState>(k: K, v: CalibrationState[K]) =>
    onChange({ ...value, [k]: v });

  const interpretation = interpret(value);
  const priceWeight = 100 - value.mandate;
  const tilt = ((value.mandate - 50) / 50) * 8;

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <Eyebrow>Step 02 · Calibration</Eyebrow>
        <h1 className="st-display text-4xl md:text-5xl" style={{ color: "var(--st-ink)" }}>
          Tune the reaction function
        </h1>
        <div className="max-w-2xl">
          <AgentBubble>{interpretation}</AgentBubble>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        {/* image-backed dual-mandate console */}
        <div className="st-panel flex flex-col p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4" style={{ color: "var(--st-brand)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
                Dual-mandate balance
              </span>
            </div>
            <span className="st-mono text-[11px]" style={{ color: "var(--st-faint)" }}>
              balanced approach
            </span>
          </div>

          <div className="st-calibration-console my-6">
            <svg
              className="st-calibration-scale"
              viewBox="0 0 1000 625"
              aria-hidden="true"
            >
              <g className="st-scale-base">
                <line x1="500" y1="350" x2="500" y2="462" />
                <path d="M474 462H526L566 516H434Z" />
                <rect x="384" y="516" width="232" height="18" rx="5" />
                <line x1="356" y1="548" x2="644" y2="548" />
              </g>
              <motion.g
                animate={{ rotate: tilt }}
                transition={{ type: "spring", stiffness: 90, damping: 14 }}
                style={{ transformBox: "view-box", transformOrigin: "500px 350px" }}
              >
                <line className="st-scale-beam-shadow" x1="186" y1="350" x2="814" y2="350" />
                <line className="st-scale-beam" x1="186" y1="342" x2="814" y2="342" />
                <circle className="st-scale-pivot" cx="500" cy="342" r="12" />
                <ScalePan x={210} y={414} tone="hike" weight={priceWeight} />
                <ScalePan x={790} y={414} tone="cut" weight={value.mandate} />
              </motion.g>
            </svg>
            <div className="st-calibration-readouts">
              <MandateReadout title="Price stability" pct={priceWeight} tone="hike" />
              <MandateReadout title="Maximum employment" pct={value.mandate} tone="cut" align="right" />
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={value.mandate}
            onChange={(e) => set("mandate", Number(e.target.value))}
            className="mt-4 w-full"
            style={{ accentColor: "var(--st-brand)" }}
            aria-label="Mandate balance"
          />
          <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--st-faint)" }}>
            When the goals are in tension, this sets which side the agent leans on. The 2025 framework calls
            for "a balanced approach" — the beam shows where you put the weight.
          </p>
        </div>

        {/* right column */}
        <div className="space-y-4">
          <Card>
            <CardHead label="Evidence threshold" value={value.risk > 60 ? "Preemptive" : value.risk < 35 ? "Cautious" : "Measured"} />
            <input
              type="range"
              min={0}
              max={100}
              value={value.risk}
              onChange={(e) => set("risk", Number(e.target.value))}
              className="mt-3 w-full"
              style={{ accentColor: "var(--st-brand)" }}
              aria-label="Risk tolerance"
            />
            <div className="mt-1 flex justify-between text-[10.5px]" style={{ color: "var(--st-faint)" }}>
              <span>Wait for confirmation</span>
              <span>Act ahead of the data</span>
            </div>
          </Card>

          <Card>
            <CardHead label="Decision horizon" value={`${value.horizon} months`} />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([3, 6, 12] as const).map((h) => {
                const active = value.horizon === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => set("horizon", h)}
                    className="st-focus-ring rounded-lg py-2.5 text-center transition-all"
                    style={{
                      background: active ? "var(--st-brand)" : "var(--st-panel-2)",
                      color: active ? "var(--st-bg-deep)" : "var(--st-ink-soft)",
                      border: "1px solid var(--st-line)",
                    }}
                  >
                    <span className="st-mono text-base">{h}M</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10.5px]" style={{ color: "var(--st-faint)" }}>
              Longer horizons need more history — Sybilion requires 120 monthly points at 7–12M.
            </p>
          </Card>

          <Card>
            <CardHead label="Inflation tolerance" value={`+${value.inflationTolerance.toFixed(1)}pp over 2%`} />
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={value.inflationTolerance}
              onChange={(e) => set("inflationTolerance", Number(e.target.value))}
              className="mt-3 w-full"
              style={{ accentColor: "var(--st-brand)" }}
              aria-label="Inflation tolerance"
            />
            <p className="mt-1 text-[10.5px]" style={{ color: "var(--st-faint)" }}>
              How far above target you'll tolerate before the bar to hike drops.
            </p>
          </Card>
        </div>
      </div>

      {/* temperament cards */}
      <div>
        <Eyebrow className="mb-3">Reaction temperament</Eyebrow>
        <div className="grid gap-3 sm:grid-cols-3">
          {TEMPERAMENTS.map((t) => {
            const active = value.temperament === t.id;
            return (
              <motion.button
                key={t.id}
                type="button"
                whileHover={{ y: -3 }}
                onClick={() => set("temperament", t.id)}
                className="st-focus-ring rounded-xl p-4 text-left transition-all"
                style={{
                  background: active ? "color-mix(in oklch, var(--st-brand) 12%, var(--st-panel))" : "var(--st-panel)",
                  border: active ? "1px solid var(--st-brand)" : "1px solid var(--st-line)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
                    {t.label}
                  </span>
                  <span
                    className="grid h-4 w-4 place-items-center rounded-full"
                    style={{ border: `1.5px solid ${active ? "var(--st-brand)" : "var(--st-line-strong)"}` }}
                  >
                    {active && <span className="h-2 w-2 rounded-full" style={{ background: "var(--st-brand)" }} />}
                  </span>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--st-muted)" }}>
                  {t.blurb}
                </p>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <StudioButton variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </StudioButton>
        <StudioButton onClick={onNext}>
          Propose data sources <ArrowRight className="h-4 w-4" />
        </StudioButton>
      </div>
    </div>
  );
}

function ScalePan({
  x,
  y,
  tone,
  weight,
}: {
  x: number;
  y: number;
  tone: "cut" | "hike";
  weight: number;
}) {
  const opacity = 0.16 + weight / 180;

  return (
    <g className="st-scale-pan" data-tone={tone}>
      <line x1={x} y1="342" x2={x - 42} y2={y - 14} />
      <line x1={x} y1="342" x2={x + 42} y2={y - 14} />
      <line x1={x} y1="342" x2={x} y2={y + 2} />
      <ellipse cx={x} cy={y} rx="78" ry="13" style={{ opacity }} />
      <path d={`M${x - 78} ${y} Q${x} ${y + 38} ${x + 78} ${y}`} />
    </g>
  );
}

function MandateReadout({
  title,
  pct,
  tone,
  align,
}: {
  title: string;
  pct: number;
  tone: "cut" | "hike";
  align?: "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""} data-tone={tone}>
      <div style={{ color: "var(--st-ink-soft)" }}>{title}</div>
      <div className="st-mono text-lg">
        {pct}%
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="st-panel p-4">{children}</div>;
}

function CardHead({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
        {label}
      </span>
      <span className="st-mono text-[11px]" style={{ color: "var(--st-brand)" }}>
        {value}
      </span>
    </div>
  );
}

function interpret(v: CalibrationState): string {
  const lean =
    v.mandate > 60
      ? "you're prioritising the employment side of the mandate"
      : v.mandate < 40
        ? "you're anchoring hard on price stability"
        : "you're holding the dual mandate roughly balanced";
  const speed =
    v.risk > 60
      ? "and you want me to act preemptively, ahead of confirming data"
      : v.risk < 35
        ? "and you'd rather wait for the data to confirm before moving"
        : "with a measured threshold for acting";
  return `Got it — ${lean}, ${speed}. I'll weight the forecast and frame the recommendation through that lens over a ${v.horizon}-month horizon.`;
}
