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

export interface SybilionSignalArtifacts {
  forecast?: SybilionForecast
  external_signals?: Record<string, unknown>
  backtest_metrics?: Record<string, unknown>
  backtest_trajectories?: Record<string, unknown>
  input?: Record<string, unknown>
}

export interface SignalResult {
  series_id: string
  weight: number
  status?: string
  job: {
    status?: string
    settled?: boolean
    pipeline_error?: string
    job_id?: string
    [key: string]: unknown
  }
  forecast: SybilionForecast | null
  artifacts?: SybilionSignalArtifacts
  forecast_series?: Record<string, number>
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

export interface DataSourceSnapshot {
  seriesId: string
  title: string
  role: string
  source?: string
  cadence?: string
  points?: number
  minRequired?: number
  weight?: number
  normalizedWeight?: number
  keywords?: string[]
  recommended?: boolean
  included?: boolean
}

export interface PipelineResponse {
  version?: string
  region?: string
  region_label?: string
  generated_at?: number
  target_series_id?: string
  included_series_ids?: string[]
  data_sources?: DataSourceSnapshot[]
  snapshot_path?: string
  signal_configs?: Array<{
    series_id: string
    weight?: number
    recency_factor?: number
    role?: string
  }>
  signals: Record<string, SignalResult | null>
  ensemble: EnsembleResult | null
  scenario: ScenarioResult | null
}

export function signalForecast(
  signal: SignalResult | null,
): SybilionForecast | null | undefined {
  if (!signal) return null
  return signal.forecast ?? signal.artifacts?.forecast
}

export function forecastPointCount(signal: SignalResult | null): number {
  if (signal?.forecast_series && Object.keys(signal.forecast_series).length > 0) {
    return Object.keys(signal.forecast_series).length
  }
  const series = signalForecast(signal)?.data?.forecast_series
  if (!series) return 0
  return Object.keys(series).length
}

export function extractSignalForecastValues(
  signal: SignalResult | null,
): { date: string; value: number }[] {
  if (!signal) return []
  const flat = signal.forecast_series
  if (flat && Object.keys(flat).length > 0) {
    return Object.entries(flat)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }
  return extractForecastValues(signalForecast(signal)?.data?.forecast_series)
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
