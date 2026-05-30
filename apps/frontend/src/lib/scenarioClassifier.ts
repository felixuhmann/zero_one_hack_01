import type { CalibrationState } from '@/studio/data'
import { synthesizeChairEnsemble } from '@/lib/chairEnsemble'
import type {
  PipelineResponse,
  ScenarioLabel,
  ScenarioResult,
  SignalResult,
} from '@/types/forecast'
import { extractSignalForecastValues } from '@/types/forecast'

/** Match backend ``scenario_classifier.py`` fixed thresholds. */
const HIKE_3M = 0.2
const CUT_3M = -0.2
const CUT_6M = -0.35
const LABOR_SLACK_CUTOFF = 4.5
const INFLATION_TARGET = 2.5
const INFLATION_DELTA = 0.1

type InflationTrend = 'rising' | 'falling' | 'stable' | 'unknown'
type YieldSignal = 'inversion' | 'normal' | 'unknown'

function buildRoleMap(
  signalConfigs: PipelineResponse['signal_configs'],
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const cfg of signalConfigs ?? []) {
    const role = cfg.role
    if (role && !(role in map)) map[role] = cfg.series_id
  }
  return map
}

function forecastSeriesDict(signal: SignalResult | null | undefined): Record<string, number> {
  if (!signal) return {}
  const rows = extractSignalForecastValues(signal)
  return Object.fromEntries(rows.map((r) => [r.date.slice(0, 10), r.value]))
}

function seriesByRole(
  signals: Record<string, SignalResult | null>,
  roleMap: Record<string, string>,
  role: string,
): Record<string, number> {
  const seriesId = roleMap[role]
  if (!seriesId) return {}
  return forecastSeriesDict(signals[seriesId])
}

function inflationSignal(
  signals: Record<string, SignalResult | null>,
  roleMap: Record<string, string>,
): { trend: InflationTrend; latest: number | null } {
  const series = seriesByRole(signals, roleMap, 'inflation')
  const dates = Object.keys(series).sort()
  if (!dates.length) return { trend: 'unknown', latest: null }

  const latest = series[dates[dates.length - 1]]
  if (dates.length < 3) return { trend: 'stable', latest }

  const early = dates.slice(0, 3).reduce((s, d) => s + series[d], 0) / 3
  const late = dates.slice(-3).reduce((s, d) => s + series[d], 0) / 3

  if (late < INFLATION_TARGET && early - late > INFLATION_DELTA) {
    return { trend: 'falling', latest }
  }
  if (late > INFLATION_TARGET && late - early > INFLATION_DELTA) {
    return { trend: 'rising', latest }
  }
  return { trend: 'stable', latest }
}

function laborSignal(
  signals: Record<string, SignalResult | null>,
  roleMap: Record<string, string>,
): { slack: boolean; latest: number | null } {
  const series = seriesByRole(signals, roleMap, 'labor')
  const dates = Object.keys(series).sort()
  if (!dates.length) return { slack: false, latest: null }
  const latest = series[dates[dates.length - 1]]
  return { slack: latest > LABOR_SLACK_CUTOFF, latest: Math.round(latest * 100) / 100 }
}

function yieldCurveSignal(
  signals: Record<string, SignalResult | null>,
  roleMap: Record<string, string>,
): YieldSignal {
  const leading = seriesByRole(signals, roleMap, 'leading')
  const target = seriesByRole(signals, roleMap, 'target')
  const common = Object.keys(leading)
    .filter((d) => d in target)
    .sort()
  if (!common.length) return 'unknown'

  const avgDiff =
    common.reduce((s, d) => s + (leading[d] - target[d]), 0) / common.length
  return avgDiff < 0 ? 'inversion' : 'normal'
}

function applyRules(
  delta3m: number,
  delta6m: number,
  inflationTrend: InflationTrend,
  laborSlack: boolean,
  yieldSignal: YieldSignal,
): ScenarioLabel {
  if (delta3m >= HIKE_3M && inflationTrend === 'rising') {
    return 'hawkish'
  }

  if (
    delta3m <= CUT_3M &&
    (inflationTrend === 'falling' || inflationTrend === 'stable')
  ) {
    return 'dovish_pivot'
  }

  if (delta3m <= CUT_3M && inflationTrend === 'unknown') {
    return 'dovish_pivot'
  }

  if (delta6m <= CUT_6M && laborSlack) {
    return 'dovish_pivot'
  }

  if (yieldSignal === 'inversion' && delta3m < 0) {
    return 'dovish_pivot'
  }

  if (yieldSignal === 'normal' && delta3m >= HIKE_3M) {
    return 'hawkish'
  }

  return 'hold'
}

function confidenceLabel(
  delta3m: number,
  delta6m: number,
  inflationTrend: InflationTrend,
  laborSlack: boolean,
  yieldSignal: YieldSignal,
): 'high' | 'medium' | 'low' {
  let confirming = 0
  if (Math.abs(delta3m) >= Math.abs(CUT_3M)) confirming += 1
  if (Math.abs(delta6m) >= Math.abs(CUT_6M)) confirming += 1
  if (inflationTrend === 'falling' || inflationTrend === 'rising') confirming += 1
  if (laborSlack) confirming += 1
  if (yieldSignal !== 'unknown') confirming += 1

  if (confirming >= 4) return 'high'
  if (confirming >= 2) return 'medium'
  return 'low'
}

function explainScenario(
  scenario: ScenarioLabel,
  delta3m: number,
  delta6m: number,
  inflationTrend: InflationTrend,
  laborSlack: boolean,
  yieldSignal: YieldSignal,
  ensembleLabel: string,
): string {
  const parts: string[] = [`${ensembleLabel}:`]

  if (scenario === 'dovish_pivot') {
    parts.push(
      `Easing bias ${delta3m >= 0 ? '+' : ''}${delta3m.toFixed(2)}pp (3M), ${delta6m >= 0 ? '+' : ''}${delta6m.toFixed(2)}pp (6M)`,
    )
  } else if (scenario === 'hawkish') {
    parts.push(
      `Tightening bias ${delta3m >= 0 ? '+' : ''}${delta3m.toFixed(2)}pp (3M), ${delta6m >= 0 ? '+' : ''}${delta6m.toFixed(2)}pp (6M)`,
    )
  } else {
    parts.push(
      `Stable path ${delta3m >= 0 ? '+' : ''}${delta3m.toFixed(2)}pp (3M), ${delta6m >= 0 ? '+' : ''}${delta6m.toFixed(2)}pp (6M)`,
    )
  }

  if (inflationTrend === 'falling') parts.push('Inflation moving toward target')
  else if (inflationTrend === 'rising') parts.push('Inflation above target')
  else if (inflationTrend === 'unknown') parts.push('Inflation signal unavailable')
  else parts.push('Inflation near target')

  if (laborSlack) parts.push(`Labor slack (>${LABOR_SLACK_CUTOFF}%)`)
  if (yieldSignal === 'inversion') parts.push('Yield curve inverted')
  else if (yieldSignal === 'normal') parts.push('Yield curve normal')

  return parts.join(' · ')
}

export function classifyScenarioFromEnsemble(
  aggregated: PipelineResponse,
  ensembleForecast: Record<string, number>,
  triggerPrefix: string,
): ScenarioResult {
  const dates = Object.keys(ensembleForecast).sort()
  const signals = aggregated.signals ?? {}
  const roleMap = buildRoleMap(aggregated.signal_configs)

  if (dates.length < 3) {
    return {
      scenario: 'hold',
      confidence: 'low',
      delta_3m: 0,
      delta_6m: 0,
      inflation_trend: 'unknown',
      inflation_latest: null,
      labor_slack: false,
      labor_latest: null,
      yield_signal: 'unknown',
      trigger: `Insufficient ensemble horizon (${dates.length} months; need 3+)`,
      signals_used: aggregated.ensemble?.contributing_signals ?? [],
    }
  }

  const current = ensembleForecast[dates[0]]
  const t3 = ensembleForecast[dates[2]]
  const t6 = dates.length >= 6 ? ensembleForecast[dates[5]] : t3
  const delta3m = Math.round((t3 - current) * 10000) / 10000
  const delta6m = Math.round((t6 - current) * 10000) / 10000

  const { trend: inflationTrend, latest: inflationLatest } = inflationSignal(
    signals,
    roleMap,
  )
  const { slack: laborSlack, latest: laborLatest } = laborSignal(signals, roleMap)
  const yieldSignal = yieldCurveSignal(signals, roleMap)

  const scenario = applyRules(
    delta3m,
    delta6m,
    inflationTrend,
    laborSlack,
    yieldSignal,
  )

  return {
    scenario,
    confidence: confidenceLabel(
      delta3m,
      delta6m,
      inflationTrend,
      laborSlack,
      yieldSignal,
    ),
    delta_3m: delta3m,
    delta_6m: delta6m,
    inflation_trend: inflationTrend,
    inflation_latest: inflationLatest,
    labor_slack: laborSlack,
    labor_latest: laborLatest,
    yield_signal: yieldSignal,
    trigger: explainScenario(
      scenario,
      delta3m,
      delta6m,
      inflationTrend,
      laborSlack,
      yieldSignal,
      triggerPrefix,
    ),
    signals_used: aggregated.ensemble?.contributing_signals ?? [],
  }
}

/** Pipeline ensemble vs chair-reweighted ensemble; same rule set for both. */
export function classifyScenarioFromPipeline(
  aggregated: PipelineResponse,
  cal: CalibrationState,
): { base: ScenarioResult; chair: ScenarioResult } {
  const pipelineEnsemble = aggregated.ensemble?.ensemble_forecast ?? {}
  const chairEnsemble = synthesizeChairEnsemble(aggregated, cal)

  const base = classifyScenarioFromEnsemble(
    aggregated,
    pipelineEnsemble,
    'Pipeline ensemble',
  )
  const chair = classifyScenarioFromEnsemble(
    aggregated,
    chairEnsemble,
    'Chair-weighted ensemble',
  )
  return { base, chair }
}

export function scenariosDiffer(a: ScenarioResult, b: ScenarioResult): boolean {
  return a.scenario !== b.scenario
}
