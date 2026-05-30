import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, MessageCircleQuestion, RotateCcw, Sliders, Zap } from "lucide-react";

import {
  defaultAssumptions,
  evaluateDecision,
  type Assumption,
  type CalibrationState,
  type Decision,
  type DecisionResult,
} from "@/studio/data";
import { DecisionGauge } from "@/studio/charts/DecisionGauge";
import { AgentAvatar, AgentBubble, Eyebrow, Pill, StudioButton } from "@/studio/ui/bits";

interface Props {
  calibration: CalibrationState;
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
    note: "Long-run expectations drift to 3.1%. Per the 2025 framework I act forcefully to re-anchor — this overrides activity data.",
  },
];

const CHALLENGES = [
  { id: "cut", q: "Why not just cut now?", a: "Cutting into above-target inflation risks un-anchoring expectations — the 2025 framework's red line. The labor data isn't yet weak enough to override that, so I hold with an easing bias rather than pre-committing." },
  { id: "lag", q: "Aren't you ignoring policy lags?", a: "No — that's exactly why the median path already drifts lower. I'm pricing the lag into the forecast horizon; acting today would double-count it given the market has ~1.3 cuts in already." },
  { id: "cautious", q: "Push back — you're too cautious.", a: "Fair challenge. If you raise your evidence threshold toward 'preemptive' in calibration, my bar to move drops and I'll front-load. Try the Labor-shock scenario to see how fast I pivot when the data justify it." },
];

export function Recommendation({ calibration, onBack, onRestart }: Props) {
  const [assumptions, setAssumptions] = useState<Assumption[]>(() => defaultAssumptions());
  const [activeScenario, setActiveScenario] = useState("base");
  const [scenarioNote, setScenarioNote] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);

  const baseline = useMemo<DecisionResult>(
    () => evaluateDecision(calibration, defaultAssumptions()),
    [calibration],
  );
  const result = useMemo(
    () => evaluateDecision(calibration, assumptions),
    [calibration, assumptions],
  );

  const shifted = assumptions.some((a) => a.value !== a.baseline);
  const decisionChanged = result.headline !== baseline.headline;

  function setAssumption(id: string, value: number) {
    setAssumptions((prev) => prev.map((a) => (a.id === id ? { ...a, value } : a)));
    setActiveScenario("custom");
    setScenarioNote(null);
  }

  function applyScenario(s: (typeof SCENARIOS)[number]) {
    setAssumptions(s.apply(defaultAssumptions()));
    setActiveScenario(s.id);
    setScenarioNote(s.note);
  }

  const tone = DECISION_TONE[result.decision];
  const maxContrib = Math.max(...result.contributions.map((c) => Math.abs(c.value)), 0.6);

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <Eyebrow>Step 06 · Decision</Eyebrow>
        <h1 className="st-display text-4xl md:text-5xl" style={{ color: "var(--st-ink)" }}>
          The recommendation
        </h1>
      </div>

      {/* decision-change banner (adaptive proof) */}
      <AnimatePresence>
        {shifted && decisionChanged && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "color-mix(in oklch, var(--st-brand) 14%, var(--st-panel))", border: "1px solid var(--st-brand)" }}>
              <Zap className="h-4 w-4 shrink-0" style={{ color: "var(--st-brand)" }} />
              <span className="text-[13px]" style={{ color: "var(--st-ink)" }}>
                Assumption shifted → recommendation updated from{" "}
                <span className="st-mono" style={{ color: "var(--st-muted)" }}>{baseline.headline}</span> to{" "}
                <span className="st-mono" style={{ color: "var(--st-brand)" }}>{result.headline}</span>.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.25fr]">
        {/* decision card */}
        <div className="st-panel relative overflow-hidden p-6">
          <div className="st-grain pointer-events-none absolute inset-0" />
          <div className="relative">
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
            <p className="mt-1 text-[13px]" style={{ color: "var(--st-muted)" }}>
              {result.headline} · target range stays anchored unless the data force a move.
            </p>

            <div className="my-5">
              <DecisionGauge tilt={result.tilt} />
            </div>

            <div className="rounded-lg p-3" style={{ background: "var(--st-panel-2)" }}>
              <Eyebrow className="mb-1" style={{ fontSize: 9 }}>
                anticipated dissent
              </Eyebrow>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--st-ink-soft)" }}>
                {result.dissent}
              </p>
            </div>
          </div>
        </div>

        {/* reasoning */}
        <div className="space-y-4">
          <div className="st-panel p-5">
            <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
              Why — contribution to the tilt
            </span>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--st-faint)" }}>
              Each force is signed: dovish pulls left (cut), hawkish pulls right (hike)
            </p>
            <div className="mt-4 space-y-3">
              {result.contributions.map((c) => (
                <ContribRow key={c.label} label={c.label} value={c.value} detail={c.detail} max={maxContrib} />
              ))}
            </div>
          </div>

          <div className="st-panel p-5">
            <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
              Reasoning
            </span>
            <ul className="mt-3 space-y-2.5">
              {result.rationale.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed" style={{ color: "var(--st-ink-soft)" }}>
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--st-brand)" }} />
                  <span dangerouslySetInnerHTML={{ __html: renderEmphasis(r) }} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* adaptive: assumption shift */}
      <div className="st-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4" style={{ color: "var(--st-brand)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
              Shift an assumption — watch the call adapt
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => applyScenario(s)}
                className="st-focus-ring rounded-full px-3 py-1.5 text-[12px] transition-all hover:brightness-110"
                style={{
                  background: activeScenario === s.id ? "var(--st-brand)" : "var(--st-panel-2)",
                  color: activeScenario === s.id ? "var(--st-bg-deep)" : "var(--st-ink-soft)",
                  border: "1px solid var(--st-line)",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {scenarioNote && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3">
              <AgentBubble>{scenarioNote}</AgentBubble>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {assumptions.map((a) => (
            <AssumptionSlider key={a.id} a={a} onChange={(v) => setAssumption(a.id, v)} />
          ))}
        </div>
      </div>

      {/* discussion loop */}
      <div className="st-panel p-5">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4" style={{ color: "var(--st-brand)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
            Disagree? Challenge the agent
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CHALLENGES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChallenge(challenge === c.id ? null : c.id)}
              className="st-focus-ring rounded-full px-3 py-1.5 text-[12px] transition-all"
              style={{
                background: challenge === c.id ? "color-mix(in oklch, var(--st-brand) 14%, var(--st-panel-2))" : "var(--st-panel-2)",
                color: "var(--st-ink-soft)",
                border: `1px solid ${challenge === c.id ? "var(--st-brand)" : "var(--st-line)"}`,
              }}
            >
              {c.q}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          {challenge && (
            <motion.div
              key={challenge}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-4 flex items-start gap-3"
            >
              <AgentAvatar size={30} />
              <p className="flex-1 pt-1 text-[13px] leading-relaxed" style={{ color: "var(--st-ink-soft)" }}>
                {CHALLENGES.find((c) => c.id === challenge)?.a}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between pt-2">
        <StudioButton variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to forecast
        </StudioButton>
        <StudioButton variant="outline" onClick={onRestart}>
          <RotateCcw className="h-4 w-4" /> New session
        </StudioButton>
      </div>
    </div>
  );
}

function ContribRow({ label, value, detail, max }: { label: string; value: number; detail: string; max: number }) {
  const pct = (Math.abs(value) / max) * 50;
  const dovish = value < 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12.5px]" style={{ color: "var(--st-ink-soft)" }}>
          {label}
        </span>
        <span className="st-mono text-[11px]" style={{ color: dovish ? "var(--st-cut)" : "var(--st-hike)" }}>
          {value >= 0 ? "+" : ""}
          {value.toFixed(2)}
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
      <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--st-faint)" }}>
        {detail}
      </p>
    </div>
  );
}

function AssumptionSlider({ a, onChange }: { a: Assumption; onChange: (v: number) => void }) {
  const moved = a.value !== a.baseline;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[12.5px]" style={{ color: "var(--st-ink-soft)" }}>
          {a.label}
        </span>
        <span className="st-mono text-[12px]" style={{ color: moved ? "var(--st-brand)" : "var(--st-muted)" }}>
          {a.value > 0 && a.unit === "bps" ? "+" : ""}
          {a.value.toFixed(a.step < 1 ? 1 : 0)} {a.unit}
        </span>
      </div>
      <input
        type="range"
        min={a.min}
        max={a.max}
        step={a.step}
        value={a.value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full"
        style={{ accentColor: "var(--st-brand)" }}
        aria-label={a.label}
      />
      <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: "var(--st-faint)" }}>
        {a.hint}
      </p>
    </div>
  );
}

function renderEmphasis(s: string): string {
  const escaped = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--st-ink);font-weight:600">$1</strong>');
}
