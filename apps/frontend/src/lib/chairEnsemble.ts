import type { CalibrationState } from '@/studio/data'
import type { PipelineResponse, SignalResult } from '@/types/forecast'
import { extractSignalForecastValues } from '@/types/forecast'

/** Mirrors evaluateDecision mandate / risk / inflation-tolerance semantics for signal weights. */
export function chairSignalMultipliers(
  role: string | undefined,
  cal: CalibrationState,
): number {
  const employW = cal.mandate / 100
  const priceW = 1 - employW
  const risk = cal.risk / 100
  const inflTol = cal.inflationTolerance

  switch (role) {
    case 'inflation':
      // Price-stability lean + higher tolerated inflation → more weight on inflation path
      return 0.6 + priceW * 0.75 + inflTol * 0.12
    case 'labor':
      return 0.6 + employW * 0.75
    case 'leading':
      // Preemptive chairs lean on market / curve (cf. market-implied contribution)
      return 0.7 + risk * 0.55
    case 'target':
      // Cautious chairs anchor on the policy series; preemptive chairs dilute it
      return 1.2 - risk * 0.4
    case 'context':
      return 0.85 + risk * 0.15
    default:
      return 1
  }
}

function seriesForecastMap(signal: SignalResult | null | undefined): Record<string, number> {
  if (!signal) return {}
  const rows = extractSignalForecastValues(signal)
  return Object.fromEntries(rows.map((r) => [r.date.slice(0, 10), r.value]))
}

/**
 * Recompute the target-rate ensemble using chair calibration weights.
 * Same weighted-average logic as backend EnsembleEngine._weighted_average.
 */
export function synthesizeChairEnsemble(
  aggregated: PipelineResponse,
  cal: CalibrationState,
): Record<string, number> {
  const signals = aggregated.signals ?? {}
  const configs = aggregated.signal_configs ?? []
  const cfgById = Object.fromEntries(
    configs.filter((c) => c.series_id).map((c) => [c.series_id!, c]),
  )

  const valid: { sid: string; series: Record<string, number>; weight: number }[] = []

  for (const [sid, signal] of Object.entries(signals)) {
    if (!signal || signal.status === 'failed') continue
    const series = seriesForecastMap(signal)
    if (!Object.keys(series).length) continue

    const cfg = cfgById[sid]
    const baseW = signal.weight ?? cfg?.weight ?? 0.25
    const mult = chairSignalMultipliers(cfg?.role, cal)
    valid.push({ sid, series, weight: baseW * mult })
  }

  if (!valid.length) {
    return { ...(aggregated.ensemble?.ensemble_forecast ?? {}) }
  }

  const totalWeight = valid.reduce((s, v) => s + v.weight, 0)
  const allDates = new Set<string>()
  for (const v of valid) {
    for (const d of Object.keys(v.series)) allDates.add(d)
  }

  const ensemble: Record<string, number> = {}
  for (const date of [...allDates].sort()) {
    let weightedSum = 0
    let activeWeight = 0
    for (const { series, weight } of valid) {
      if (date in series) {
        const w = weight / totalWeight
        weightedSum += series[date] * w
        activeWeight += w
      }
    }
    if (activeWeight > 0) {
      ensemble[date] = Math.round((weightedSum / activeWeight) * 10000) / 10000
    }
  }

  return ensemble
}

export interface ChairStepSignal {
  seriesId: string
  role: string
  normWeight: number
  /** This signal's own month-over-month move into the next meeting, in bps. */
  signalStepBps: number
  /** normWeight * signalStepBps — adds up across signals to the ensemble step. */
  contributionBps: number
}

export interface ChairEnsembleStep {
  available: boolean
  currentDate: string | null
  nextDate: string | null
  current: number | null
  next: number | null
  /** Chair ensemble's first forward step (next published month − current), bps. */
  stepBps: number
  perSignal: ChairStepSignal[]
}

const EMPTY_STEP: ChairEnsembleStep = {
  available: false,
  currentDate: null,
  nextDate: null,
  current: null,
  next: null,
  stepBps: 0,
  perSignal: [],
}

/**
 * Decompose the chair-weighted ensemble's first forward step (the initial slope
 * of the "Scenario path" line) into per-signal contributions. The contributions
 * sum to `stepBps`, so the next-meeting call can be read straight off the same
 * line the forecast step draws. Offset-invariant by construction: it works off
 * month-over-month deltas, not absolute blend levels.
 */
export function chairEnsembleNextStep(
  aggregated: PipelineResponse,
  cal: CalibrationState,
): ChairEnsembleStep {
  const signals = aggregated.signals ?? {}
  const configs = aggregated.signal_configs ?? []
  const cfgById = Object.fromEntries(
    configs.filter((c) => c.series_id).map((c) => [c.series_id!, c]),
  )

  const valid: {
    sid: string
    role: string
    series: Record<string, number>
    weight: number
  }[] = []
  for (const [sid, signal] of Object.entries(signals)) {
    if (!signal || signal.status === 'failed') continue
    const series = seriesForecastMap(signal)
    if (!Object.keys(series).length) continue
    const cfg = cfgById[sid]
    const baseW = signal.weight ?? cfg?.weight ?? 0.25
    valid.push({
      sid,
      role: cfg?.role ?? 'other',
      series,
      weight: baseW * chairSignalMultipliers(cfg?.role, cal),
    })
  }
  if (!valid.length) return EMPTY_STEP

  const allDates = new Set<string>()
  for (const v of valid) for (const d of Object.keys(v.series)) allDates.add(d)
  const dates = [...allDates].sort()
  if (dates.length < 2) return EMPTY_STEP

  const d0 = dates[0]
  const d1 = dates[1]
  const present = valid.filter((v) => d0 in v.series && d1 in v.series)
  if (!present.length) return EMPTY_STEP

  const totalW = present.reduce((s, v) => s + v.weight, 0) || 1
  const perSignal: ChairStepSignal[] = present.map((v) => {
    const normWeight = v.weight / totalW
    const signalStepBps = (v.series[d1] - v.series[d0]) * 100
    return {
      seriesId: v.sid,
      role: v.role,
      normWeight,
      signalStepBps,
      contributionBps: normWeight * signalStepBps,
    }
  })

  const stepBps = perSignal.reduce((s, p) => s + p.contributionBps, 0)
  const current = present.reduce(
    (s, v) => s + (v.weight / totalW) * v.series[d0],
    0,
  )

  return {
    available: true,
    currentDate: d0,
    nextDate: d1,
    current: Math.round(current * 10000) / 10000,
    next: Math.round((current + stepBps / 100) * 10000) / 10000,
    stepBps: Math.round(stepBps * 100) / 100,
    perSignal,
  }
}

/** Catalog weights from the pipeline (no chair multipliers). */
export function pipelineEnsembleWeightSummary(
  aggregated: PipelineResponse,
): { seriesId: string; role: string; pct: number }[] {
  const normalized = aggregated.ensemble?.normalized_weights
  if (normalized && Object.keys(normalized).length > 0) {
    return Object.entries(normalized)
      .map(([seriesId, w]) => ({
        seriesId,
        role:
          aggregated.signal_configs?.find((c) => c.series_id === seriesId)?.role ??
          'other',
        pct: Math.round(w * 100),
      }))
      .sort((a, b) => b.pct - a.pct)
  }

  const signals = aggregated.signals ?? {}
  const configs = aggregated.signal_configs ?? []
  const cfgById = Object.fromEntries(
    configs.filter((c) => c.series_id).map((c) => [c.series_id!, c]),
  )
  const rows: { seriesId: string; role: string; w: number }[] = []
  for (const [sid, signal] of Object.entries(signals)) {
    if (!signal || signal.status === 'failed') continue
    if (!Object.keys(seriesForecastMap(signal)).length) continue
    const cfg = cfgById[sid]
    rows.push({
      seriesId: sid,
      role: cfg?.role ?? 'other',
      w: signal.weight ?? cfg?.weight ?? 0.25,
    })
  }
  const total = rows.reduce((s, r) => s + r.w, 0) || 1
  return rows
    .map((r) => ({
      seriesId: r.seriesId,
      role: r.role,
      pct: Math.round((r.w / total) * 100),
    }))
    .sort((a, b) => b.pct - a.pct)
}

export function chairEnsembleWeightSummary(
  aggregated: PipelineResponse,
  cal: CalibrationState,
): { seriesId: string; role: string; pct: number }[] {
  const signals = aggregated.signals ?? {}
  const configs = aggregated.signal_configs ?? []
  const cfgById = Object.fromEntries(
    configs.filter((c) => c.series_id).map((c) => [c.series_id!, c]),
  )

  const rows: { seriesId: string; role: string; w: number }[] = []
  for (const [sid, signal] of Object.entries(signals)) {
    if (!signal || signal.status === 'failed') continue
    if (!Object.keys(seriesForecastMap(signal)).length) continue
    const cfg = cfgById[sid]
    const baseW = signal.weight ?? cfg?.weight ?? 0.25
    rows.push({
      seriesId: sid,
      role: cfg?.role ?? 'other',
      w: baseW * chairSignalMultipliers(cfg?.role, cal),
    })
  }

  const total = rows.reduce((s, r) => s + r.w, 0) || 1
  return rows
    .map((r) => ({
      seriesId: r.seriesId,
      role: r.role,
      pct: Math.round((r.w / total) * 100),
    }))
    .sort((a, b) => b.pct - a.pct)
}
