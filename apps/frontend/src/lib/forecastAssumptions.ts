import { defaultAssumptions, type Assumption } from '@/studio/data'
import type { PipelineResponse } from '@/types/forecast'
import { extractSignalForecastValues } from '@/types/forecast'

function latestForecastValue(
  aggregated: PipelineResponse,
  seriesId: string,
): number | null {
  const signal = aggregated.signals?.[seriesId]
  if (!signal) return null
  const rows = extractSignalForecastValues(signal)
  if (!rows.length) return null
  return rows[rows.length - 1].value
}

function roleSeriesId(
  aggregated: PipelineResponse,
  role: string,
): string | undefined {
  return aggregated.signal_configs?.find((c) => c.role === role)?.series_id
}

/** Map Sybilion median paths into decision-step assumption sliders. */
export function assumptionsFromForecast(
  aggregated: PipelineResponse | null | undefined,
): Assumption[] {
  const base = defaultAssumptions()
  if (!aggregated) return base

  const pceId = roleSeriesId(aggregated, 'inflation') ?? 'PCEPILFE'
  const laborId = roleSeriesId(aggregated, 'labor') ?? 'UNRATE'
  const leadingId = roleSeriesId(aggregated, 'leading') ?? 'DGS2'
  const targetId =
    aggregated.target_series_id ??
    roleSeriesId(aggregated, 'target') ??
    'FEDFUNDS'

  const corepce = latestForecastValue(aggregated, pceId)
  const unrate = latestForecastValue(aggregated, laborId)
  const leading = latestForecastValue(aggregated, leadingId)
  const target = latestForecastValue(aggregated, targetId)

  const ensemble = aggregated.ensemble?.ensemble_forecast
  const ensDates = ensemble ? Object.keys(ensemble).sort() : []
  let marketcuts = -35
  if (ensemble && ensDates.length >= 2 && target != null) {
    const end = ensemble[ensDates[ensDates.length - 1]]
    marketcuts = Math.round((end - target) * 100)
    marketcuts = Math.max(-150, Math.min(75, marketcuts))
  } else if (leading != null && target != null) {
    marketcuts = Math.round((leading - target) * 100)
    marketcuts = Math.max(-150, Math.min(75, marketcuts))
  }

  return base.map((a) => {
    if (a.id === 'corepce' && corepce != null) {
      return { ...a, value: Math.round(corepce * 10) / 10, baseline: Math.round(corepce * 10) / 10 }
    }
    if (a.id === 'unrate' && unrate != null) {
      return { ...a, value: Math.round(unrate * 10) / 10, baseline: Math.round(unrate * 10) / 10 }
    }
    if (a.id === 'marketcuts') {
      return { ...a, value: marketcuts, baseline: marketcuts }
    }
    return a
  })
}
