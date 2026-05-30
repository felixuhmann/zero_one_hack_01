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
