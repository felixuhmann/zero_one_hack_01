import { motion } from "motion/react";

interface DecisionGaugeProps {
  tilt: number; // − dovish .. + hawkish (roughly -1.5..1.5)
}

const R = 92;
const CX = 110;
const CY = 110;

function polar(angleDeg: number, r: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
}

// map tilt [-1.5, 1.5] -> angle [180, 0] (left=dovish, right=hawkish)
function tiltToAngle(tilt: number) {
  const clamped = Math.max(-1.5, Math.min(1.5, tilt));
  return 90 - (clamped / 1.5) * 90;
}

function arc(startDeg: number, endDeg: number, r: number) {
  const s = polar(startDeg, r);
  const e = polar(endDeg, r);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  // travelling from a larger angle to a smaller one sweeps left→right across
  // the top of the gauge (counter-clockwise on screen = sweep flag 0)
  const sweep = startDeg > endDeg ? 0 : 1;
  return `M${s.x},${s.y} A${r},${r} 0 ${large} ${sweep} ${e.x},${e.y}`;
}

export function DecisionGauge({ tilt }: DecisionGaugeProps) {
  const needle = tiltToAngle(tilt);
  const tip = polar(needle, R - 12);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 134" className="w-full max-w-[260px]">
        {/* zones: dovish (left), hold (center), hawkish (right) */}
        <path d={arc(180, 117, R)} fill="none" stroke="var(--st-cut)" strokeWidth="10" strokeLinecap="round" opacity="0.85" />
        <path d={arc(116, 64, R)} fill="none" stroke="var(--st-hold)" strokeWidth="10" strokeLinecap="round" opacity="0.85" />
        <path d={arc(63, 0, R)} fill="none" stroke="var(--st-hike)" strokeWidth="10" strokeLinecap="round" opacity="0.85" />

        {/* ticks */}
        {[180, 135, 90, 45, 0].map((a) => {
          const o = polar(a, R - 18);
          const i = polar(a, R - 24);
          return <line key={a} x1={o.x} y1={o.y} x2={i.x} y2={i.y} stroke="var(--st-line-strong)" strokeWidth="1.5" />;
        })}

        {/* needle */}
        <motion.line
          x1={CX}
          y1={CY}
          x2={tip.x}
          y2={tip.y}
          stroke="var(--st-ink)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={false}
          animate={{ x2: tip.x, y2: tip.y }}
          transition={{ type: "spring", stiffness: 90, damping: 14 }}
        />
        <circle cx={CX} cy={CY} r="6" fill="var(--st-ink)" />
        <circle cx={CX} cy={CY} r="11" fill="none" stroke="var(--st-line-strong)" strokeWidth="1" />

        <text x={26} y={128} className="st-eyebrow" fontSize="8.5" fill="var(--st-cut)">
          CUT
        </text>
        <text x={CX} y={128} textAnchor="middle" className="st-eyebrow" fontSize="8.5" fill="var(--st-hold)">
          HOLD
        </text>
        <text x={194} y={128} textAnchor="end" className="st-eyebrow" fontSize="8.5" fill="var(--st-hike)">
          HIKE
        </text>
      </svg>
      <div className="-mt-2 text-center">
        <span className="st-mono text-xs" style={{ color: "var(--st-muted)" }}>
          tilt {tilt >= 0 ? "+" : ""}
          {tilt.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
