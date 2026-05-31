import { normalizeChartDate } from '@/lib/chartDates'
import type { ScenarioLabel, ScenarioResult } from '@/types/forecast'

export const SCENARIO_LINE_COLOR: Record<ScenarioLabel, string> = {
  hold: 'var(--st-hold)',
  dovish_pivot: 'var(--st-cut)',
  hawkish: 'var(--st-hike)',
}

export const SCENARIO_DISPLAY_LABEL: Record<ScenarioLabel, string> = {
  hold: 'Hold',
  dovish_pivot: 'Dovish pivot',
  hawkish: 'Hawkish',
}

/**
 * Shift an ensemble path so its first published month sits at `anchor` (the
 * current policy rate / seam). The chair + baseline ensembles are weighted
 * blends of different-unit series, so their absolute level relative to the
 * funds rate is an artifact; only the trajectory (month-over-month deltas)
 * carries policy meaning. Anchoring removes the spurious seam jump while
 * preserving every delta, so the drawn line's slope matches both the scenario
 * classifier (which already works off deltas) and the next-meeting call.
 */
export function anchorEnsembleToValue(
  ensemble: Record<string, number> | undefined,
  anchor: number | null | undefined,
): Record<string, number> | undefined {
  if (!ensemble || anchor == null || !Number.isFinite(anchor)) return ensemble
  const dates = Object.keys(ensemble).sort()
  if (!dates.length) return ensemble
  const shift = anchor - ensemble[dates[0]]
  if (!Number.isFinite(shift)) return ensemble
  const out: Record<string, number> = {}
  for (const d of dates) out[d] = Math.round((ensemble[d] + shift) * 10000) / 10000
  return out
}

/** Median ensemble path from NOW (seam) through every published ensemble month. */
export function buildScenarioEnsemblePath(
  ensembleForecast: Record<string, number> | undefined,
  seam: { t: string; v: number } | null | undefined,
): { t: string; v: number }[] {
  if (!ensembleForecast || !seam) return []

  const seamKey = normalizeChartDate(seam.t)
  const points: { t: string; v: number }[] = [{ t: seamKey, v: seam.v }]

  for (const date of Object.keys(ensembleForecast).sort()) {
    const t = normalizeChartDate(date)
    const v = ensembleForecast[date]
    if (!Number.isFinite(v)) continue
    if (t === seamKey) {
      points[0] = { t: seamKey, v: seam.v }
      continue
    }
    if (t < seamKey) continue
    points.push({ t, v })
  }

  return points.length >= 2 ? points : []
}

export function scenarioLegendLabel(scenario: ScenarioResult | null | undefined): string {
  if (!scenario) return 'Ensemble scenario path'
  const label = SCENARIO_DISPLAY_LABEL[scenario.scenario] ?? scenario.scenario
  return `Scenario path (${label})`
}

export function scenarioLineColor(scenario: ScenarioResult | null | undefined): string {
  if (!scenario?.scenario) return 'var(--st-muted)'
  return SCENARIO_LINE_COLOR[scenario.scenario] ?? 'var(--st-muted)'
}
