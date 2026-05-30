import type { BandPoint, SeriesPoint } from '@/studio/data'
import {
  buildScenarioEnsemblePath,
  scenarioLegendLabel,
  scenarioLineColor,
} from '@/lib/scenarioChart'
import type {
  DataSourceSnapshot,
  ScenarioResult,
  SignalResult,
  SybilionForecast,
} from '@/types/forecast'
import { signalForecast } from '@/types/forecast'

export interface SeriesChartView {
  seriesId: string
  title: string
  unit: string
  decimals: number
  history: SeriesPoint[]
  band: BandPoint[]
  backtest: { t: string; pred: number }[]
  scenarioPath: { t: string; v: number }[]
  scenarioLegend: string
  scenarioColor: string
  baselineScenarioPath: { t: string; v: number }[]
  baselineScenarioLegend: string
  read: string
  yDomain: [number, number]
}

/** Months of history/backtest shown on fan charts (avoids flat long-run scaling). */
export const CHART_LOOKBACK_MONTHS = 12

const DISPLAY: Record<string, { unit: string; decimals: number }> = {
  FEDFUNDS: { unit: '%', decimals: 2 },
  DGS2: { unit: '%', decimals: 2 },
  PCEPILFE: { unit: '%', decimals: 1 },
  UNRATE: { unit: '%', decimals: 1 },
  CES0500000003: { unit: '%', decimals: 1 },
  NFCI: { unit: '', decimals: 2 },
  PAYEMS: { unit: 'k', decimals: 0 },
  NAPM: { unit: '', decimals: 1 },
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

function quantile(
  qf: Record<string, number> | undefined,
  key: string,
  fallback: number,
): number {
  if (!qf) return fallback
  const v = qf[key]
  return v != null && Number.isFinite(v) ? v : fallback
}

function parseGroundTruth(input: Record<string, unknown> | undefined): SeriesPoint[] {
  const ts = input?.timeseries
  if (!ts || typeof ts !== 'object') return []
  return Object.entries(ts as Record<string, number>)
    .map(([t, v]) => ({ t: t.slice(0, 10), v: Number(v) }))
    .filter((p) => Number.isFinite(p.v))
    .sort((a, b) => a.t.localeCompare(b.t))
}

function trimHistoryToLastValid(
  history: SeriesPoint[],
  lastValid: string | undefined,
): SeriesPoint[] {
  if (!lastValid) return history
  return history.filter((p) => p.t <= lastValid)
}

function monthIndex(t: string): number {
  const [y, m] = t.slice(0, 7).split('-').map(Number)
  return y * 12 + (m - 1)
}

function lookbackCutoff(dates: string[], months: number): string | null {
  if (!dates.length) return null
  const maxIdx = Math.max(...dates.map(monthIndex))
  const minIdx = maxIdx - (months - 1)
  const y = Math.floor(minIdx / 12)
  const m = (minIdx % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function filterByLookback<T extends { t: string }>(
  points: T[],
  months: number,
): T[] {
  if (points.length <= 1) return points
  const cutoff = lookbackCutoff(
    points.map((p) => p.t),
    months,
  )
  if (!cutoff) return points
  return points.filter((p) => p.t >= cutoff)
}

function filterBandByLookback(band: BandPoint[], months: number): BandPoint[] {
  if (band.length <= 1) return band
  const cutoff = lookbackCutoff(
    band.map((p) => p.t),
    months,
  )
  if (!cutoff) return band
  const seam = band[0]
  const trimmed = band.filter((p) => p.t >= cutoff)
  if (!trimmed.length) return band
  if (trimmed[0].t !== seam.t && seam.t < cutoff) {
    return [seam, ...trimmed]
  }
  return trimmed
}

function buildForecastBand(
  forecast: SybilionForecast | null | undefined,
  history: SeriesPoint[],
): BandPoint[] {
  const data = forecast?.data
  const raw = data?.forecast_series
  if (!raw || typeof raw !== 'object') return []

  const lastValid =
    typeof data?.last_valid_data_index === 'string'
      ? data.last_valid_data_index
      : undefined
  const seam: SeriesPoint | null =
    (lastValid ? history.find((h) => h.t === lastValid) : undefined) ??
    (history.length ? history[history.length - 1] : null) ??
    null

  const band: BandPoint[] = []
  if (seam) {
    band.push({
      t: seam.t,
      p05: seam.v,
      p25: seam.v,
      p50: seam.v,
      p75: seam.v,
      p95: seam.v,
      history: seam.v,
    })
  }

  for (const date of Object.keys(raw).sort()) {
    const pt = raw[date]
    if (typeof pt === 'number') {
      band.push({
        t: date.slice(0, 10),
        p05: pt,
        p25: pt,
        p50: pt,
        p75: pt,
        p95: pt,
      })
      continue
    }
    if (!pt || typeof pt !== 'object') continue
    const median = Number(pt.forecast)
    const qf = pt.quantile_forecast as Record<string, number> | undefined
    const p50 = quantile(qf, '0.5', median) ?? quantile(qf, '0.50', median)
    band.push({
      t: date.slice(0, 10),
      p05: round(quantile(qf, '0.05', p50), 4),
      p25: round(quantile(qf, '0.25', p50), 4),
      p50: round(Number.isFinite(median) ? median : p50, 4),
      p75: round(quantile(qf, '0.75', p50), 4),
      p95: round(quantile(qf, '0.95', p50), 4),
    })
  }

  return band
}

type TrajectoryPoint = {
  actual?: number | null
  quantile_forecast?: Record<string, number>
}

type TrajectoryWindow = {
  forecast_start?: string
  forecast_series?: Record<string, TrajectoryPoint>
}

function backtestMedian(pt: TrajectoryPoint): number | null {
  const qf = pt.quantile_forecast
  const v = qf?.['0.5'] ?? qf?.['0.50']
  if (v == null || !Number.isFinite(Number(v))) return null
  return Number(v)
}

/** Stitch rolling backtest windows into one held-out p50 path (Sybilion trajectories). */
function buildBacktestOverlay(
  trajectories: Record<string, unknown> | undefined,
): { t: string; pred: number }[] {
  const windows = trajectories?.data
  if (!Array.isArray(windows) || windows.length === 0) return []

  // Same calendar month appears in multiple windows; keep p50 from the latest origin.
  const byDate = new Map<string, { pred: number; forecastStart: string }>()

  for (const win of windows as TrajectoryWindow[]) {
    const series = win.forecast_series
    const forecastStart = win.forecast_start ?? ''
    if (!series) continue

    for (const [t, pt] of Object.entries(series)) {
      if (pt?.actual == null) continue
      const pred = backtestMedian(pt)
      if (pred == null) continue

      const prev = byDate.get(t)
      if (!prev || forecastStart >= prev.forecastStart) {
        byDate.set(t, { pred, forecastStart })
      }
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, { pred }]) => ({ t, pred }))
}

function computeYDomain(
  history: SeriesPoint[],
  band: BandPoint[],
  scenarioPath: { t: string; v: number }[] = [],
): [number, number] {
  // Exclude backtest p50 from the axis — held-out medians can be wild vs realised rates.
  const vals = [
    ...history.map((h) => h.v),
    ...scenarioPath.map((p) => p.v),
    ...band.flatMap((b) => [b.p05, b.p25, b.p50, b.p75, b.p95]),
  ].filter((v) => Number.isFinite(v))

  if (!vals.length) return [0, 1]
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const pad = Math.max((max - min) * 0.1, 0.15)
  return [min - pad, max + pad]
}

function horizonRead(band: BandPoint[], decimals: number, unit: string): string {
  if (band.length < 2) return 'Forecast loaded.'
  const start = band[0].p50
  const end = band[band.length - 1].p50
  const delta = end - start
  const sign = delta >= 0 ? '+' : ''
  return `Median path ${sign}${delta.toFixed(decimals)}${unit} over the published horizon (p50).`
}

export function buildSeriesChartView(
  signal: SignalResult | null | undefined,
  seriesId: string,
  dataSources?: DataSourceSnapshot[],
): SeriesChartView | null {
  if (!signal || signal.status === 'failed') return null

  const forecast = signalForecast(signal)
  const input = signal.artifacts?.input as Record<string, unknown> | undefined
  const trajectories = signal.artifacts?.backtest_trajectories as
    | Record<string, unknown>
    | undefined

  const lastValid =
    typeof forecast?.data?.last_valid_data_index === 'string'
      ? forecast.data.last_valid_data_index
      : undefined
  const historyFull = trimHistoryToLastValid(parseGroundTruth(input), lastValid)
  if (!historyFull.length) return null

  const bandFull = buildForecastBand(forecast, historyFull)
  if (bandFull.length < 2) return null

  const backtestFull = buildBacktestOverlay(trajectories)
  const history = filterByLookback(historyFull, CHART_LOOKBACK_MONTHS)
  const band = filterBandByLookback(bandFull, CHART_LOOKBACK_MONTHS)
  const backtest = filterByLookback(backtestFull, CHART_LOOKBACK_MONTHS)
  const meta = DISPLAY[seriesId] ?? { unit: '', decimals: 2 }
  const src = dataSources?.find((d) => d.seriesId === seriesId)

  return {
    seriesId,
    title: src?.title ?? seriesId,
    unit: meta.unit,
    decimals: meta.decimals,
    history,
    band,
    backtest,
    scenarioPath: [],
    scenarioLegend: '',
    scenarioColor: '',
    baselineScenarioPath: [],
    baselineScenarioLegend: '',
    read: horizonRead(band, meta.decimals, meta.unit),
    yDomain: computeYDomain(history, band),
  }
}

export interface TargetEnsemblePaths {
  pipelineEnsemble?: Record<string, number>
  chairEnsemble?: Record<string, number>
  chairScenario?: ScenarioResult | null
}

export function buildTargetChartView(
  signals: Record<string, SignalResult | null>,
  targetSeriesId: string | null | undefined,
  dataSources?: DataSourceSnapshot[],
  ensembles?: TargetEnsemblePaths | null,
): SeriesChartView | null {
  if (!targetSeriesId) return null
  const base = buildSeriesChartView(
    signals[targetSeriesId],
    targetSeriesId,
    dataSources,
  )
  if (!base) return null

  const seam = base.band[0]
  const seamVal = seam?.history ?? seam?.p50
  const seamPt = seam && seamVal != null ? { t: seam.t, v: seamVal } : null

  const baselineScenarioPath = buildScenarioEnsemblePath(
    ensembles?.pipelineEnsemble,
    seamPt,
  )
  const scenarioPath = buildScenarioEnsemblePath(
    ensembles?.chairEnsemble,
    seamPt,
  )
  const chairScenario = ensembles?.chairScenario

  return {
    ...base,
    baselineScenarioPath,
    baselineScenarioLegend: 'Baseline ensemble (catalog weights)',
    scenarioPath,
    scenarioLegend: scenarioLegendLabel(chairScenario),
    scenarioColor: scenarioLineColor(chairScenario),
    yDomain: computeYDomain(
      base.history,
      base.band,
      [...baselineScenarioPath, ...scenarioPath],
    ),
  }
}
