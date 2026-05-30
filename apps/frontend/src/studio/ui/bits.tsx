import type { ReactNode } from "react";
import { motion } from "motion/react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Eyebrow({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <p className={cn("st-eyebrow", className)} style={style}>
      {children}
    </p>
  );
}

type Tone = "neutral" | "brand" | "cut" | "hold" | "hike";

const TONE_STYLE: Record<Tone, React.CSSProperties> = {
  neutral: {},
  brand: {
    background: "color-mix(in oklch, var(--st-brand) 16%, transparent)",
    color: "var(--st-brand)",
    borderColor: "color-mix(in oklch, var(--st-brand) 35%, transparent)",
  },
  cut: { background: "var(--st-cut-soft)", color: "var(--st-cut)", borderColor: "color-mix(in oklch, var(--st-cut) 35%, transparent)" },
  hold: { background: "var(--st-hold-soft)", color: "var(--st-hold)", borderColor: "color-mix(in oklch, var(--st-hold) 35%, transparent)" },
  hike: { background: "var(--st-hike-soft)", color: "var(--st-hike)", borderColor: "color-mix(in oklch, var(--st-hike) 35%, transparent)" },
};

/** A small status chip — shadcn <Badge> for neutral, tinted for decision tones. */
export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  if (tone === "neutral") {
    return (
      <Badge variant="secondary" className={cn("font-mono", className)}>
        {children}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn("font-mono border", className)} style={TONE_STYLE[tone]}>
      {children}
    </Badge>
  );
}

/** Thin wrapper over the shadcn <Button> keeping the studio's call signature. */
export function StudioButton({
  children,
  onClick,
  variant = "solid",
  disabled,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "solid" | "ghost" | "outline";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const mapped = variant === "solid" ? "default" : variant;
  return (
    <Button type={type} onClick={onClick} disabled={disabled} variant={mapped} className={className}>
      {children}
    </Button>
  );
}

export function AgentBubble({
  children,
  thinking,
}: {
  children: ReactNode;
  thinking?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3"
    >
      <AgentAvatar pulse={thinking} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-medium text-foreground text-[15px]">Sibyl</span>
          <Pill tone="brand">forecast agent</Pill>
        </div>
        <div className="text-[14px] leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </motion.div>
  );
}

export function AgentAvatar({ pulse, size = 34 }: { pulse?: boolean; size?: number }) {
  const dataSize = size <= 28 ? "sm" : size >= 40 ? "lg" : "default";
  return (
    <span className="relative inline-flex">
      <Avatar size={dataSize} className="overflow-visible">
        <AvatarFallback
          className="text-primary-foreground"
          style={{ background: "radial-gradient(120% 120% at 30% 20%, var(--st-brand-dim), var(--st-brand))" }}
        >
          <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none">
            <path d="M12 2v20M5 7l14 10M19 7L5 17" stroke="var(--st-bg-deep)" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
            <circle cx="12" cy="12" r="3.2" fill="var(--st-bg-deep)" />
          </svg>
        </AvatarFallback>
      </Avatar>
      {pulse && (
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ border: "1.5px solid var(--st-brand)", animation: "st-pulse-ring 1.8s ease-out infinite", opacity: 0.6 }}
        />
      )}
    </span>
  );
}

export function StatBlock({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  const fg: Record<Tone, string> = {
    neutral: "var(--st-ink)",
    brand: "var(--st-brand)",
    cut: "var(--st-cut)",
    hold: "var(--st-hold)",
    hike: "var(--st-hike)",
  };
  return (
    <div>
      <Eyebrow style={{ fontSize: 9.5 }}>{label}</Eyebrow>
      <div className="st-mono mt-1 text-2xl" style={{ color: fg[tone] }}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
