import type { ReactNode } from "react";
import { motion } from "motion/react";

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

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "cut" | "hold" | "hike";
  className?: string;
}) {
  const bg: Record<string, string> = {
    neutral: "var(--st-panel-2)",
    brand: "color-mix(in oklch, var(--st-brand) 16%, transparent)",
    cut: "var(--st-cut-soft)",
    hold: "var(--st-hold-soft)",
    hike: "var(--st-hike-soft)",
  };
  const fg: Record<string, string> = {
    neutral: "var(--st-muted)",
    brand: "var(--st-brand)",
    cut: "var(--st-cut)",
    hold: "var(--st-hold)",
    hike: "var(--st-hike)",
  };
  return (
    <span
      className={cn("st-mono inline-flex items-center gap-1 rounded-full px-2.5 py-0.5", className)}
      style={{ fontSize: 10.5, background: bg[tone], color: fg[tone], border: "1px solid var(--st-line)" }}
    >
      {children}
    </span>
  );
}

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
  const base =
    "st-focus-ring inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40";
  const styles: Record<string, React.CSSProperties> = {
    solid: { background: "var(--st-brand)", color: "var(--st-bg-deep)" },
    outline: { background: "transparent", color: "var(--st-ink)", border: "1px solid var(--st-line-strong)" },
    ghost: { background: "transparent", color: "var(--st-muted)" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, variant === "solid" && "hover:brightness-110", variant !== "solid" && "hover:bg-black/5", className)}
      style={styles[variant]}
    >
      {children}
    </button>
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
          <span className="st-display text-[15px]" style={{ color: "var(--st-ink)" }}>
            Sibyl
          </span>
          <Pill tone="brand">forecast agent</Pill>
        </div>
        <div className="text-[14px] leading-relaxed" style={{ color: "var(--st-ink-soft)" }}>
          {children}
        </div>
      </div>
    </motion.div>
  );
}

export function AgentAvatar({ pulse, size = 34 }: { pulse?: boolean; size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-xl"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(120% 120% at 30% 20%, var(--st-brand-dim), var(--st-panel-2))",
        border: "1px solid var(--st-line-strong)",
        boxShadow: "0 0 18px var(--st-brand-glow)",
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none">
        <path d="M12 2v20M5 7l14 10M19 7L5 17" stroke="var(--st-bg-deep)" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
        <circle cx="12" cy="12" r="3.2" fill="var(--st-bg-deep)" />
      </svg>
      {pulse && (
        <span
          className="absolute inset-0 rounded-xl"
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
  tone?: "neutral" | "brand" | "cut" | "hold" | "hike";
}) {
  const fg: Record<string, string> = {
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
      {sub && (
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--st-faint)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
