/*
 * Our own Fed reaction-function forecasting model.
 *
 * Inputs:
 *   1. The probabilistic forecasts for the other signals (Sybilion p50 paths
 *      for inflation, unemployment, the 2Y, …) — i.e. the predictions on the
 *      Forecast page.
 *   2. The chair's reaction-function calibration (mandate balance, evidence
 *      threshold, inflation tolerance, …).
 *
 * Output: a policy-rate quantile fan the model *prescribes*. It is overlaid on
 * the "Policy rate · quantile fan" chart, and the very same model + data drives
 * the next-meeting call on the Decision page — where the input prediction
 * timeseries can be nudged for what-if scenarios.
 *
 * The reaction core lives in `data.ts` (`reactionContributions`) so the chart
 * overlay and the next-meeting call can never drift apart.
 */

import {
  defaultAssumptions,
  reactionContributions,
  type Assumption,
  type BandPoint,
  type CalibrationState,
  type ReactionInputs,
} from "@/studio/data";
import { buildSeriesChartView, buildTargetChartView } from "@/lib/sybilionCharts";
import type { PipelineResponse } from "@/types/forecast";

/** FRED series that feed each reaction-function input. */
const SERIES = {
  corepce: "PCEPILFE",
  unrate: "UNRATE",
  market: "DGS2",
} as const;

/*
 * Fan tuning.
 *   MOVE_PER_TILT — maps the chair's tilt onto the cumulative rate move (pp)
 *     the reaction function wants given the economy it is looking at.
 *   ADJUST        — monthly gradualism: the rate eases toward the prescription
 *     rather than jumping (central banks move in steps).
 *   SIGMA_*       — model uncertainty, widening with the horizon.
 */
const MOVE_PER_TILT = 0.7;
const ADJUST = 0.34;
const SIGMA_BASE = 0.14;
const SIGMA_SLOPE = 0.46;

function round(v: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function roundTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}

interface DriverPath {
  now: number; // latest observed value (the "current reading")
  terminal: number; // p50 at the last forecast month
  at: (t: string) => number; // p50 at month `t`, carried forward when sparse
}

/** Build a month-indexed p50 path for one driver from its Sybilion forecast. */
function driverPath(
  agg: PipelineResponse,
  seriesId: string,
): DriverPath | null {
  const view = buildSeriesChartView(agg.signals[seriesId], seriesId, agg.data_sources);
  if (!view || view.band.length === 0) return null;

  const now = view.history.length
    ? view.history[view.history.length - 1].v
    : view.band[0].p50;

  const map = new Map<string, number>();
  for (const b of view.band) map.set(b.t, b.p50);
  const months = view.band.map((b) => b.t);
  const terminal = view.band[view.band.length - 1].p50;

  const at = (t: string): number => {
    const exact = map.get(t);
    if (exact != null) return exact;
    // carry forward the latest forecast month at or before `t`
    let val = now;
    for (const m of months) {
      if (m <= t) val = map.get(m)!;
      else break;
    }
    return val;
  };

  return { now, terminal, at };
}

export interface ReactionForecast {
  /** Policy-rate quantile fan prescribed by the reaction function. */
  band: BandPoint[];
  /** Seam rate (latest observed policy rate). */
  startRate: number;
  /** Model median at the final forecast month. */
  modelTerminal: number;
  /** Market/Sybilion median at the final forecast month, when available. */
  marketTerminal: number | null;
  /** Model − market at the horizon, in bps (+ = model is more hawkish). */
  divergenceBps: number | null;
}

/**
 * Run the reaction-function model against the published forecasts.
 *
 * `shifts` parallel-shifts the input prediction timeseries (for the Decision
 * page what-if scenarios); pass nothing for the as-forecast baseline.
 */
export function buildReactionForecast(
  agg: PipelineResponse | null | undefined,
  cal: CalibrationState,
  shifts?: Partial<ReactionInputs>,
): ReactionForecast | null {
  if (!agg) return null;
  const targetView = buildTargetChartView(
    agg.signals,
    agg.target_series_id,
    agg.data_sources,
  );
  if (!targetView || targetView.band.length < 2) return null;

  const months = targetView.band.map((b) => b.t); // [seam, ...forecast]
  const startRate = targetView.band[0].p50;

  const base = defaultAssumptions();
  const baseVal = (id: string) => base.find((a) => a.id === id)!.value;

  const corePath = driverPath(agg, SERIES.corepce);
  const unratePath = driverPath(agg, SERIES.unrate);
  const marketPath = driverPath(agg, SERIES.market);

  // 2Y move over the published horizon → bps of cuts(−)/hikes(+) priced.
  const marketcutsBase = marketPath
    ? (marketPath.terminal - marketPath.now) * 100
    : baseVal("marketcuts");
  const expectationsBase = baseVal("expectations");

  const dCore = shifts?.corepce ?? 0;
  const dUnrate = shifts?.unrate ?? 0;
  const dMarket = shifts?.marketcuts ?? 0;
  const dExp = shifts?.expectations ?? 0;

  const N = months.length - 1; // number of forecast steps
  const band: BandPoint[] = [
    {
      t: months[0],
      p05: startRate,
      p25: startRate,
      p50: startRate,
      p75: startRate,
      p95: startRate,
      history: startRate,
    },
  ];

  let level = startRate;
  for (let k = 1; k <= N; k++) {
    const t = months[k];
    const frac = k / N;
    const inputs: ReactionInputs = {
      corepce: (corePath ? corePath.at(t) : baseVal("corepce")) + dCore,
      unrate: (unratePath ? unratePath.at(t) : baseVal("unrate")) + dUnrate,
      marketcuts: marketcutsBase + dMarket,
      expectations: expectationsBase + dExp,
    };
    const { actTilt } = reactionContributions(inputs, cal);
    // the rate the reaction function wants given month-k's economy …
    const desired = startRate + actTilt * MOVE_PER_TILT;
    // … approached gradually (policy inertia).
    level += ADJUST * (desired - level);
    const sigma = SIGMA_BASE + SIGMA_SLOPE * Math.sqrt(frac);
    band.push({
      t,
      p05: round(level - 1.64 * sigma),
      p25: round(level - 0.67 * sigma),
      p50: round(level),
      p75: round(level + 0.67 * sigma),
      p95: round(level + 1.64 * sigma),
    });
  }

  const modelTerminal = band[band.length - 1].p50;
  const marketTerminal = targetView.band[targetView.band.length - 1].p50 ?? null;
  const divergenceBps =
    marketTerminal != null ? Math.round((modelTerminal - marketTerminal) * 100) : null;

  return { band, startRate, modelTerminal, marketTerminal, divergenceBps };
}

/**
 * Reaction-function inputs derived from the published forecasts, returned as
 * assumption sliders so the Decision page starts aligned with the Forecast
 * page (and can then be nudged for what-if scenarios).
 */
export function deriveReactionAssumptions(
  agg: PipelineResponse | null | undefined,
): Assumption[] {
  const base = defaultAssumptions();
  if (!agg) return base;

  const corePath = driverPath(agg, SERIES.corepce);
  const unratePath = driverPath(agg, SERIES.unrate);
  const marketPath = driverPath(agg, SERIES.market);

  return base.map((a) => {
    let v = a.value;
    if (a.id === "corepce" && corePath) v = roundTo(corePath.now, 0.1);
    else if (a.id === "unrate" && unratePath) v = roundTo(unratePath.now, 0.1);
    else if (a.id === "marketcuts" && marketPath)
      v = roundTo((marketPath.terminal - marketPath.now) * 100, 5);
    // expectations: no dedicated FRED series — keep the framework default.
    v = clamp(v, a.min, a.max);
    return { ...a, value: v, baseline: v };
  });
}

/**
 * Parallel shift of each input timeseries implied by the current assumption
 * sliders vs. the forecast-derived baseline. Feeds `buildReactionForecast` so
 * the Decision page fan reflects what-if nudges.
 */
export function shiftsFromAssumptions(
  assumptions: Assumption[],
  agg: PipelineResponse | null | undefined,
): Partial<ReactionInputs> {
  const derived = deriveReactionAssumptions(agg);
  const dval = (id: string) => derived.find((a) => a.id === id)?.value ?? 0;
  const cval = (id: string) => assumptions.find((a) => a.id === id)?.value ?? 0;
  return {
    corepce: cval("corepce") - dval("corepce"),
    unrate: cval("unrate") - dval("unrate"),
    marketcuts: cval("marketcuts") - dval("marketcuts"),
    expectations: cval("expectations") - dval("expectations"),
  };
}
