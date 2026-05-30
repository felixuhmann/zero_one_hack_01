import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, FastForward } from "lucide-react";

import { runForecastPipeline } from "@/api/forecast";
import type { PipelineResponse } from "@/types/forecast";
import { JOB_STAGES, PROCESSING_FACTS, PROPOSED_SOURCES } from "@/studio/data";
import { Eyebrow, Pill, StudioButton } from "@/studio/ui/bits";

interface Props {
  include: Record<string, boolean>;
  onDone: () => void;
  onForecastReady?: (data: PipelineResponse) => void;
}

export function Processing({ include, onDone, onForecastReady }: Props) {
  const signals = useMemo(() => PROPOSED_SOURCES.filter((s) => include[s.seriesId]), [include]);
  const seriesIds = useMemo(() => signals.map((s) => s.seriesId), [signals]);
  const speeds = useRef(signals.map(() => 0.006 + Math.random() * 0.006));
  const [progress, setProgress] = useState<number[]>(() => signals.map(() => 0));
  const [factIdx, setFactIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [apiDone, setApiDone] = useState(false);
  const doneFiredRef = useRef(false);
  const fetchStarted = useRef(false);

  useEffect(() => {
    if (fetchStarted.current || seriesIds.length < 2) return;
    fetchStarted.current = true;
    setError(null);
    void runForecastPipeline("fed", seriesIds)
      .then((data) => {
        onForecastReady?.(data);
        setApiDone(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Forecast request failed");
        setApiDone(true);
      });
  }, [seriesIds, onForecastReady]);

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((prev) =>
        prev.map((p, i) => {
          if (!apiDone) return Math.min(0.92, p + speeds.current[i]);
          return Math.min(1, p + speeds.current[i] * 2);
        }),
      );
    }, 70);
    return () => clearInterval(id);
  }, [apiDone]);

  useEffect(() => {
    const id = setInterval(() => setFactIdx((i) => (i + 1) % PROCESSING_FACTS.length), 3200);
    return () => clearInterval(id);
  }, []);

  const overall = progress.length ? progress.reduce((a, b) => a + b, 0) / progress.length : 0;
  const allDone = apiDone && overall >= 0.85;

  useEffect(() => {
    if (allDone && !doneFiredRef.current) {
      doneFiredRef.current = true;
      const t = setTimeout(onDone, 1100);
      return () => clearTimeout(t);
    }
  }, [allDone, onDone]);

  function stageFor(p: number): number {
    if (p >= 1) return JOB_STAGES.length - 1;
    return Math.min(JOB_STAGES.length - 2, Math.floor(p * (JOB_STAGES.length - 1)));
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="space-y-2">
        <Eyebrow>Step 03 · Forecasting</Eyebrow>
        <h1 className="st-display text-4xl md:text-5xl" style={{ color: "var(--st-ink)" }}>
          Sybilion is forecasting
        </h1>
        {error && (
          <p className="text-sm" style={{ color: "var(--st-cut)" }}>
            {error}
          </p>
        )}
      </div>

      <div className="mt-8 grid flex-1 items-center gap-8 lg:grid-cols-[360px_1fr]">
        {/* radar orb */}
        <div className="flex flex-col items-center">
          <div className="relative grid h-64 w-64 place-items-center">
            {[0, 1, 2].map((r) => (
              <span
                key={r}
                className="absolute rounded-full"
                style={{
                  width: 90 + r * 56,
                  height: 90 + r * 56,
                  border: "1px solid var(--st-line)",
                }}
              />
            ))}
            <span className="absolute rounded-full" style={{ width: 244, height: 244, background: "radial-gradient(circle, var(--st-brand-glow), transparent 62%)" }} />
            {/* sweep */}
            <motion.span
              className="absolute"
              style={{ width: 244, height: 244, transformOrigin: "center" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "linear" }}
            >
              <span
                className="absolute left-1/2 top-1/2 h-1/2 w-1/2 origin-top-left"
                style={{ background: "conic-gradient(from 0deg, transparent, var(--st-brand-glow))", clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
              />
            </motion.span>

            <svg viewBox="0 0 120 120" className="absolute h-44 w-44 -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--st-line)" strokeWidth="5" />
              <motion.circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="var(--st-brand)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - overall) }}
                transition={{ ease: "linear" }}
              />
            </svg>
            <div className="relative text-center">
              <div className="st-mono text-3xl" style={{ color: "var(--st-ink)" }}>
                {Math.round(overall * 100)}%
              </div>
              <div className="st-eyebrow mt-1" style={{ fontSize: 9 }}>
                {allDone ? "settled" : "running"}
              </div>
            </div>
          </div>

          <div className="mt-4 h-12 max-w-xs text-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={factIdx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--st-muted)" }}
              >
                {PROCESSING_FACTS[factIdx]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* job list */}
        <div className="space-y-2.5">
          {signals.map((s, i) => {
            const p = progress[i];
            const stage = stageFor(p);
            const done = p >= 1;
            return (
              <div key={s.seriesId} className="st-panel p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="st-mono text-[12px]" style={{ color: "var(--st-ink)" }}>
                      {s.seriesId}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--st-faint)" }}>
                      {s.title}
                    </span>
                  </div>
                  {done ? (
                    <Pill tone="brand">
                      <Check className="h-3 w-3" /> settled
                    </Pill>
                  ) : (
                    <span className="st-mono text-[11px]" style={{ color: "var(--st-brand)" }}>
                      {JOB_STAGES[stage].label}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  {JOB_STAGES.slice(0, -1).map((st, idx) => (
                    <div key={st.key} className="flex flex-1 items-center gap-1.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--st-line)" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(0, Math.min(1, p * (JOB_STAGES.length - 1) - idx)) * 100}%`,
                            background: idx < stage || done ? "var(--st-brand)" : "var(--st-brand-dim)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex justify-end pt-2">
            {allDone ? (
              <StudioButton onClick={onDone}>
                View forecast <Check className="h-4 w-4" />
              </StudioButton>
            ) : (
              <StudioButton variant="ghost" onClick={onDone}>
                <FastForward className="h-3.5 w-3.5" /> Skip the queue (demo)
              </StudioButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
