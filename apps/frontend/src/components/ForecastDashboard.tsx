import { useCallback, useEffect, useState } from 'react'
import { Loader2, Play, RefreshCw } from 'lucide-react'

import { checkApiHealth, runForecastPipeline } from '@/api/forecast'
import { Button } from '@/components/ui/button'
import type { PipelineResponse } from '@/types/forecast'
import {
  extractForecastValues,
  forecastPointCount,
} from '@/types/forecast'

type LoadState = 'idle' | 'loading' | 'success' | 'error'

const SCENARIO_LABELS: Record<string, string> = {
  hold: 'Hold',
  dovish_pivot: 'Dovish pivot',
  hawkish: 'Hawkish',
}

export function ForecastDashboard() {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PipelineResponse | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const probeHealth = useCallback(async () => {
    try {
      await checkApiHealth()
      setBackendOnline(true)
    } catch {
      setBackendOnline(false)
    }
  }, [])

  useEffect(() => {
    void probeHealth()
  }, [probeHealth])

  async function handleRunPipeline() {
    setLoadState('loading')
    setError(null)
    try {
      const result = await runForecastPipeline()
      setData(result)
      setLoadState('success')
    } catch (err) {
      setLoadState('error')
      setError(err instanceof Error ? err.message : 'Pipeline request failed')
    }
  }

  const scenario = data?.scenario
  const ensemble = data?.ensemble

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          Fed rate forecasting
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Pipeline results
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Runs the backend pipeline (FRED → Sybilion → ensemble → scenario).
          This can take several minutes while Sybilion jobs finish.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            type="button"
            disabled={loadState === 'loading'}
            onClick={() => void handleRunPipeline()}
          >
            {loadState === 'loading' ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Play data-icon="inline-start" />
            )}
            {loadState === 'loading' ? 'Running pipeline…' : 'Run forecast'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void probeHealth()}
          >
            <RefreshCw data-icon="inline-start" />
            Check backend
          </Button>
          <span className="text-sm text-muted-foreground">
            API:{' '}
            {backendOnline === null
              ? 'checking…'
              : backendOnline
                ? 'connected'
                : 'offline — start with npm run dev:backend'}
          </span>
        </div>
      </header>

      {loadState === 'loading' && (
        <div className="rounded-lg border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          Waiting for Sybilion jobs to complete. Keep this tab open; the
          request may run up to an hour depending on queue time.
        </div>
      )}

      {error && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      {scenario && (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Scenario</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Classification
              </dt>
              <dd className="text-2xl font-semibold capitalize">
                {SCENARIO_LABELS[scenario.scenario] ?? scenario.scenario}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Confidence
              </dt>
              <dd className="text-2xl font-semibold capitalize">
                {scenario.confidence}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Δ 3 months
              </dt>
              <dd className="font-mono text-lg">
                {scenario.delta_3m >= 0 ? '+' : ''}
                {scenario.delta_3m} pp
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Δ 6 months
              </dt>
              <dd className="font-mono text-lg">
                {scenario.delta_6m >= 0 ? '+' : ''}
                {scenario.delta_6m} pp
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {scenario.trigger}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2 text-xs">
            <li className="rounded-full bg-muted px-2.5 py-1">
              Inflation: {scenario.inflation_trend}
            </li>
            <li className="rounded-full bg-muted px-2.5 py-1">
              Labor slack: {scenario.labor_slack ? 'yes' : 'no'}
            </li>
            <li className="rounded-full bg-muted px-2.5 py-1">
              Yield curve: {scenario.yield_signal}
            </li>
          </ul>
        </section>
      )}

      {ensemble && (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Ensemble</h2>
          <div className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Contributing: </span>
              {ensemble.contributing_signals?.join(', ') || '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Dropped: </span>
              {ensemble.dropped_signals?.length
                ? ensemble.dropped_signals.join(', ')
                : 'none'}
            </p>
          </div>
          {ensemble.normalized_weights && (
            <table className="mb-6 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Signal</th>
                  <th className="py-2 font-medium">Weight</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(ensemble.normalized_weights).map(
                  ([id, weight]) => (
                    <tr key={id} className="border-b border-border/60">
                      <td className="py-2 pr-4 font-mono">{id}</td>
                      <td className="py-2">{(weight * 100).toFixed(1)}%</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
          {ensemble.ensemble_forecast &&
            Object.keys(ensemble.ensemble_forecast).length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  Blended forecast series
                </h3>
                <div className="max-h-48 overflow-auto rounded-md border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(ensemble.ensemble_forecast)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([date, value]) => (
                          <tr key={date} className="border-t border-border/60">
                            <td className="px-3 py-1.5 font-mono text-xs">
                              {date}
                            </td>
                            <td className="px-3 py-1.5 font-mono">{value}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
        </section>
      )}

      {data?.signals && (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Signals (Sybilion)</h2>
          <div className="space-y-4">
            {Object.entries(data.signals).map(([seriesId, signal]) => (
              <div
                key={seriesId}
                className="rounded-lg border border-border/80 p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-mono font-semibold">{seriesId}</h3>
                  {signal ? (
                    <span className="text-xs text-muted-foreground">
                      {signal.job.status ?? 'unknown'} · weight{' '}
                      {(signal.weight * 100).toFixed(0)}% ·{' '}
                      {forecastPointCount(signal)} points
                    </span>
                  ) : (
                    <span className="text-xs text-destructive">Failed</span>
                  )}
                </div>
                {signal?.forecast?.data?.forecast_series && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      Forecast points
                    </summary>
                    <ul className="mt-2 max-h-32 overflow-auto font-mono text-xs">
                      {extractForecastValues(
                        signal.forecast.data.forecast_series,
                      ).map(({ date, value }) => (
                        <li key={date} className="flex justify-between gap-4">
                          <span>{date}</span>
                          <span>{value}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {data && (
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Raw JSON</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRaw((v) => !v)}
            >
              {showRaw ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showRaw && (
            <pre className="mt-4 max-h-[28rem] overflow-auto rounded-md bg-muted p-4 text-xs leading-relaxed">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </section>
      )}
    </div>
  )
}
