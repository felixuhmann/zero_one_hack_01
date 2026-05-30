import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Building2, Radio } from "lucide-react";

import { COUNTRIES } from "@/studio/data";
import { WorldMap } from "@/studio/charts/WorldMap";
import { Eyebrow, Pill, StudioButton } from "@/studio/ui/bits";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface Props {
  selected: string | null;
  onSelect: (code: string) => void;
  onNext: () => void;
}

export function CountrySelect({ selected, onSelect, onNext }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const focus = COUNTRIES.find((c) => c.code === (hovered ?? selected)) ?? null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        <WorldMap countries={COUNTRIES} selected={selected} hovered={hovered} onSelect={onSelect} onHover={setHovered} fullBleed />
      </div>

      {/* legibility scrims */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(102deg, color-mix(in oklch, var(--st-bg) 88%, transparent) 0%, transparent 44%)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-44"
        style={{ background: "linear-gradient(180deg, color-mix(in oklch, var(--st-bg) 78%, transparent), transparent)" }}
      />

      {/* header overlay */}
      <div className="pointer-events-none absolute left-6 top-6 max-w-xl space-y-3 md:left-10 md:top-9">
        <Eyebrow>Step 01 · Jurisdiction</Eyebrow>
        <h1 className="st-display text-4xl text-foreground md:text-5xl">Where are you setting policy?</h1>
      </div>

      {/* detail card overlay */}
      <div className="absolute bottom-6 right-6 w-[340px] max-w-[calc(100%-3rem)]">
        <Card className="gap-0 py-0 supports-[backdrop-filter]:bg-card/80 supports-[backdrop-filter]:backdrop-blur-md">
          <div className="p-5">
            <AnimatePresence mode="wait">
              {focus ? (
                <motion.div key={focus.code} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  <div className="flex items-center justify-between">
                    <span className="st-display text-3xl text-foreground">{focus.code}</span>
                    {focus.status === "live" ? (
                      <Pill tone="brand">
                        <Radio className="size-3" /> live
                      </Pill>
                    ) : (
                      <Pill>coming soon</Pill>
                    )}
                  </div>
                  <div className="mt-1 text-lg text-foreground/80">{focus.name}</div>
                  <Separator className="my-4" />
                  <div className="space-y-3">
                    <Row icon={<Building2 className="size-3.5" />} label="Authority" value={focus.bank} />
                    <Row label="Current policy rate" value={focus.rate} mono />
                  </div>
                  {focus.status === "soon" && (
                    <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
                      Not yet onboarded — its national series still need to clear Sybilion's minimum-data thresholds.
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <p className="text-sm text-muted-foreground">
                    Hover a node to inspect a central bank. Select the United States to begin.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{COUNTRIES.filter((c) => c.status === "live").length} live</span>
                <span>{COUNTRIES.filter((c) => c.status === "soon").length} on the roadmap</span>
              </div>
              <StudioButton onClick={onNext} disabled={!selected} className="w-full">
                {selected ? "Propose data sources" : "Select a jurisdiction"}
                <ArrowRight className="size-4" />
              </StudioButton>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={mono ? "st-mono text-sm text-foreground" : "text-sm text-foreground"}>{value}</span>
    </div>
  );
}
