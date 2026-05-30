import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Database, Plus, Sparkles } from "lucide-react";

import { PROPOSED_SOURCES, ROLE_LABEL, type CalibrationState } from "@/studio/data";
import { AgentBubble, Eyebrow, Pill, StudioButton } from "@/studio/ui/bits";

interface Props {
  include: Record<string, boolean>;
  setInclude: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  calibration: CalibrationState;
  onBack: () => void;
  onNext: () => void;
}

const REFINEMENTS = [
  { id: "labor", chip: "Weight labor more", add: ["PAYEMS"], note: "Done — I've added nonfarm payrolls so labor momentum carries more weight. The 2025 benchmark revisions make this read worth tracking." },
  { id: "sticky", chip: "Add a sticky-inflation check", add: ["CES0500000003"], note: "Added average hourly earnings as a wage-driven inflation cross-check." },
  { id: "transmission", chip: "Watch financial conditions", add: ["NFCI"], note: "Included the Chicago Fed conditions index — it captures tightening that can substitute for a hike." },
  { id: "lean", chip: "Keep it lean", remove: ["PAYEMS", "CES0500000003", "NFCI"], note: "Trimmed back to the four core signals: the target, inflation, the market path, and labor." },
] as const;

export function DataSources({ include, setInclude, calibration, onBack, onNext }: Props) {
  const [note, setNote] = useState<string | null>(null);

  const selected = PROPOSED_SOURCES.filter((s) => include[s.seriesId]);
  const totalWeight = selected.reduce((a, s) => a + s.weight, 0) || 1;
  const enoughInputs = selected.length >= 2;

  const normalized = useMemo(
    () => selected.map((s) => ({ id: s.seriesId, w: s.weight / totalWeight })),
    [selected, totalWeight],
  );

  function toggle(id: string) {
    setInclude((p) => ({ ...p, [id]: !p[id] }));
  }

  function applyRefinement(r: (typeof REFINEMENTS)[number]) {
    setInclude((p) => {
      const next = { ...p };
      ("add" in r ? r.add : []).forEach((id) => (next[id] = true));
      ("remove" in r ? r.remove : []).forEach((id) => (next[id] = false));
      return next;
    });
    setNote(r.note);
  }

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <Eyebrow>Step 02 · Data sources</Eyebrow>
        <h1 className="st-display text-4xl md:text-5xl" style={{ color: "var(--st-ink)" }}>
          Approve the inputs
        </h1>
        <div className="max-w-2xl">
          <AgentBubble>
            {note ?? (
              <>
                Based on your {calibration.mandate < 40 ? "price-stability lean" : calibration.mandate > 60 ? "employment lean" : "balanced stance"}, I
                selected these monthly series — each clears Sybilion's minimum-data threshold. Toggle any off, or
                ask me to reconsider. <span style={{ color: "var(--st-brand)" }}>Keyword quality drives forecast accuracy</span>, so I've tuned the
                keywords per series.
              </>
            )}
          </AgentBubble>
        </div>
      </div>

      {/* refinement chips — the planning loop */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="st-eyebrow mr-1" style={{ fontSize: 9.5 }}>
          <Sparkles className="mr-1 inline h-3 w-3" /> refine
        </span>
        {REFINEMENTS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => applyRefinement(r)}
            className="st-focus-ring rounded-full px-3 py-1.5 text-[12px] transition-all hover:brightness-110"
            style={{ background: "var(--st-panel-2)", color: "var(--st-ink-soft)", border: "1px solid var(--st-line)" }}
          >
            {r.chip}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-2.5">
          {PROPOSED_SOURCES.map((s, i) => {
            const on = include[s.seriesId];
            const ratio = Math.min(s.points / s.minRequired, 1);
            return (
              <motion.div
                key={s.seriesId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="st-panel flex items-start gap-4 p-4 transition-all"
                style={{ opacity: on ? 1 : 0.55, borderColor: on ? "var(--st-line-strong)" : "var(--st-line)" }}
              >
                <button
                  type="button"
                  onClick={() => toggle(s.seriesId)}
                  className="st-focus-ring mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md transition-all"
                  style={{
                    background: on ? "var(--st-brand)" : "transparent",
                    border: `1.5px solid ${on ? "var(--st-brand)" : "var(--st-line-strong)"}`,
                  }}
                  aria-label={on ? `Exclude ${s.title}` : `Include ${s.title}`}
                >
                  {on && <Check className="h-4 w-4" style={{ color: "var(--st-bg-deep)" }} />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium" style={{ color: "var(--st-ink)" }}>
                      {s.title}
                    </span>
                    <span className="st-mono text-[10.5px]" style={{ color: "var(--st-faint)" }}>
                      {s.seriesId}
                    </span>
                    <Pill tone={s.role === "inflation" ? "hike" : s.role === "labor" ? "cut" : s.role === "leading" ? "brand" : "neutral"}>
                      {ROLE_LABEL[s.role]}
                    </Pill>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--st-muted)" }}>
                    {s.rationale}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                    <DataMeter ratio={ratio} points={s.points} min={s.minRequired} />
                    <span className="st-mono text-[10.5px]" style={{ color: "var(--st-faint)" }}>
                      {s.source} · {s.cadence}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.keywords.map((k) => (
                      <span key={k} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--st-panel-2)", color: "var(--st-faint)" }}>
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ensemble preview */}
        <div className="st-panel h-fit p-5 lg:sticky lg:top-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4" style={{ color: "var(--st-brand)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--st-ink)" }}>
              Ensemble preview
            </span>
          </div>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--st-faint)" }}>
            {selected.length} signals · weights re-normalise live
          </p>

          <div className="mt-4 space-y-2.5">
            <AnimatePresence initial={false}>
              {normalized
                .sort((a, b) => b.w - a.w)
                .map(({ id, w }) => {
                  const s = PROPOSED_SOURCES.find((x) => x.seriesId === id)!;
                  return (
                    <motion.div
                      key={id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                    >
                      <div className="mb-1 flex items-center justify-between text-[11.5px]">
                        <span style={{ color: "var(--st-ink-soft)" }}>{s.seriesId}</span>
                        <span className="st-mono" style={{ color: "var(--st-brand)" }}>
                          {(w * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--st-line)" }}>
                        <motion.div
                          layout
                          className="h-full rounded-full"
                          style={{ width: `${w * 100}%`, background: "var(--st-brand)" }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
            </AnimatePresence>
          </div>

          {!enoughInputs && (
            <p className="mt-4 flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--st-hold)" }}>
              <Plus className="h-3 w-3" /> Include at least two signals to run.
            </p>
          )}

          <StudioButton onClick={onNext} disabled={!enoughInputs} className="mt-5 w-full">
            Run on Sybilion <ArrowRight className="h-4 w-4" />
          </StudioButton>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <StudioButton variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </StudioButton>
      </div>
    </div>
  );
}

function DataMeter({ ratio, points, min }: { ratio: number; points: number; min: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="h-2.5 w-1 rounded-sm"
            style={{ background: i / 10 < ratio ? "var(--st-brand)" : "var(--st-line)" }}
          />
        ))}
      </div>
      <span className="st-mono text-[10.5px]" style={{ color: "var(--st-faint)" }}>
        {points} pts · min {min}
      </span>
    </div>
  );
}
