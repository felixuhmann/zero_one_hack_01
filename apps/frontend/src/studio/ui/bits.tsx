import type { ReactNode } from "react";

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

/** Muted intro or helper copy for a studio step. */
export function StudioNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[14px] leading-relaxed text-muted-foreground", className)}>{children}</p>
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
