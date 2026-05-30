export type ScenarioLabel = 'hold' | 'dovish_pivot' | 'hawkish'
export type ConfidenceLabel = 'high' | 'medium' | 'low'

export interface ForecastSeriesPoint {
  forecast?: number
  [key: string]: unknown
}

export interface SybilionForecastData {
  forecast_series?: Record<string, ForecastSeriesPoint | number>
  backtest?: Record<string, { metrics?: Record<string, number> }>
  [key: string]: unknown
}

export interface SybilionForecast {
  data?: SybilionForecastData
  [key: string]: unknown
}

export interface SignalResult {
  series_id: string
  weight: number
  job: {
    status?: string
    settled?: boolean
    pipeline_error?: string
    [key: string]: unknown
  }
  forecast: SybilionForecast | null
}

export interface EnsembleResult {
  ensemble_forecast?: Record<string, number>
  contributing_signals?: string[]
  normalized_weights?: Record<string, number>
  dropped_signals?: string[]
  backtest?: Record<string, Record<string, number>>
}

export interface ScenarioResult {
  scenario: ScenarioLabel
  confidence: ConfidenceLabel
  delta_3m: number
  delta_6m: number
  inflation_trend: string
  inflation_latest: number | null
  labor_slack: boolean
  labor_latest: number | null
  yield_signal: string
  trigger: string
  signals_used: string[]
}

export interface PipelineResponse {
  signals: Record<string, SignalResult | null>
  ensemble: EnsembleResult | null
  scenario: ScenarioResult | null
}

export function forecastPointCount(signal: SignalResult | null): number {
  const series = signal?.forecast?.data?.forecast_series
  if (!series) return 0
  return Object.keys(series).length
}

export function extractForecastValues(
  series: Record<string, ForecastSeriesPoint | number> | undefined,
): { date: string; value: number }[] {
  if (!series) return []
  return Object.entries(series)
    .map(([date, point]) => {
      const value =
        typeof point === 'number'
          ? point
          : typeof point === 'object' && point !== null && 'forecast' in point
            ? Number(point.forecast)
            : NaN
      return { date, value }
    })
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => a.date.localeCompare(b.date))
}
