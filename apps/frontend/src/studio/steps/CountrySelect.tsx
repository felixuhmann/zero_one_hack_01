import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Building2, Radio } from "lucide-react";

import { COUNTRIES } from "@/studio/data";
import { WorldMap } from "@/studio/charts/WorldMap";
import { AgentBubble, Eyebrow, Pill, StudioButton } from "@/studio/ui/bits";

interface Props {
  selected: string | null;
  onSelect: (code: string) => void;
  onNext: () => void;
}

export function CountrySelect({ selected, onSelect, onNext }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = COUNTRIES.find((c) => c.code === (hovered ?? selected)) ?? null;

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <Eyebrow>Step 01 · Jurisdiction</Eyebrow>
        <h1 className="st-display text-4xl md:text-5xl" style={{ color: "var(--st-ink)" }}>
          Where are you setting policy?
        </h1>
        <div className="max-w-2xl">
          <AgentBubble>
            I build a decision agent per central bank — each has its own mandate, data, and reaction
            function. <span style={{ color: "var(--st-brand)" }}>The Federal Reserve is live today.</span> Other
            jurisdictions are queued as we onboard their national series.
          </AgentBubble>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <WorldMap
          countries={COUNTRIES}
          selected={selected}
          hovered={hovered}
          onSelect={onSelect}
          onHover={setHovered}
        />

        <div className="st-panel relative flex flex-col p-5">
          <AnimatePresence mode="wait">
            {focus ? (
              <motion.div
                key={focus.code}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-between">
                  <span className="st-display text-3xl" style={{ color: "var(--st-ink)" }}>
                    {focus.code}
                  </span>
                  {focus.status === "live" ? (
                    <Pill tone="brand">
                      <Radio className="h-3 w-3" /> live
                    </Pill>
                  ) : (
                    <Pill>coming soon</Pill>
                  )}
                </div>
                <div className="mt-1 text-lg" style={{ color: "var(--st-ink-soft)" }}>
                  {focus.name}
                </div>
                <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "var(--st-line)" }}>
                  <Row icon={<Building2 className="h-3.5 w-3.5" />} label="Authority" value={focus.bank} />
                  <Row label="Current policy rate" value={focus.rate} mono />
                </div>
                {focus.status === "soon" && (
                  <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "var(--st-faint)" }}>
                    Not yet onboarded. We need its national time series to clear Sybilion's minimum-data
                    thresholds before the agent can forecast here.
                  </p>
                )}
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full flex-col justify-center">
                <p className="text-sm" style={{ color: "var(--st-muted)" }}>
                  Hover a node to inspect a central bank. Select the United States to begin.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-auto pt-6">
            <div className="mb-3 flex items-center justify-between text-[11px]" style={{ color: "var(--st-faint)" }}>
              <span>{COUNTRIES.filter((c) => c.status === "live").length} live</span>
              <span>{COUNTRIES.filter((c) => c.status === "soon").length} on the roadmap</span>
            </div>
            <StudioButton onClick={onNext} disabled={!selected} className="w-full">
              {selected ? "Configure the agent" : "Select a jurisdiction"}
              <ArrowRight className="h-4 w-4" />
            </StudioButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--st-muted)" }}>
        {icon}
        {label}
      </span>
      <span className={mono ? "st-mono text-sm" : "text-sm"} style={{ color: "var(--st-ink)" }}>
        {value}
      </span>
    </div>
  );
}
