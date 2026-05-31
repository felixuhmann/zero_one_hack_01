import type { PipelineResponse } from '@/types/forecast'

const API_BASE = '/api'

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    const { detail } = body
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          typeof item === 'object' && item !== null && 'msg' in item
            ? String((item as { msg: string }).msg)
            : String(item),
        )
        .join('; ')
    }
  } catch {
    // ignore JSON parse errors
  }
  return response.statusText || `Request failed (${response.status})`
}

export async function checkApiHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/health`)
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }
  return response.json() as Promise<{ status: string }>
}

/**
 * Raised when the backend *replied* with a non-2xx status, i.e. the run reached
 * the server and failed deterministically. Distinct from a transport-level
 * failure (dropped connection), where the backend job may still be running.
 */
export class ForecastServerError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ForecastServerError'
    this.status = status
  }
}

/** Run the Fed/ECB pipeline for the series selected in Decision Studio. */
export async function runForecastPipeline(
  region = 'fed',
  seriesIds?: string[],
  signal?: AbortSignal,
): Promise<PipelineResponse> {
  const response = await fetch(
    `${API_BASE}/forecast/run?region=${encodeURIComponent(region)}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        seriesIds && seriesIds.length > 0 ? { series_ids: seriesIds } : {},
      ),
      signal,
    },
  )

  if (!response.ok) {
    throw new ForecastServerError(await parseErrorMessage(response), response.status)
  }

  return response.json() as Promise<PipelineResponse>
}

/** Load the last saved aggregate without re-running Sybilion. */
export async function fetchAggregatedForecast(
  region = 'fed',
): Promise<PipelineResponse> {
  const response = await fetch(
    `${API_BASE}/forecast/aggregated?region=${encodeURIComponent(region)}`,
    { headers: { Accept: 'application/json' } },
  )

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json() as Promise<PipelineResponse>
}

const DEFAULT_POLL_INTERVAL_MS = 4000

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/** `generated_at` of the saved aggregate, or null if absent/unreadable. */
async function aggregatedGeneratedAt(region: string): Promise<number | null> {
  try {
    const data = await fetchAggregatedForecast(region)
    return typeof data.generated_at === 'number' ? data.generated_at : null
  } catch {
    return null
  }
}

/**
 * Run the pipeline resiliently.
 *
 * The `POST /forecast/run` request can stay open for minutes with no response
 * bytes; if that connection is silently dropped, `fetch` hangs forever even
 * though the backend job keeps running and writes its result to disk. To avoid
 * getting stuck, we fire the run *and* poll the saved aggregate as a fallback,
 * resolving with whichever arrives first.
 *
 * A `ForecastServerError` (the backend replied with an error) is fatal and
 * rejects immediately. A transport failure is treated as transient — polling
 * keeps going because the run may well finish on the server regardless.
 */
export async function runForecastPipelineResilient(
  region = 'fed',
  seriesIds?: string[],
  opts: { signal?: AbortSignal; pollIntervalMs?: number } = {},
): Promise<PipelineResponse> {
  const { signal, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = opts

  // Baseline timestamp of any pre-existing aggregate, captured before we start
  // the run. We only accept a polled result strictly newer than this, so a
  // stale cached aggregate from a previous run is never mistaken for this one.
  const baseline = await aggregatedGeneratedAt(region)

  return new Promise<PipelineResponse>((resolve, reject) => {
    let settled = false
    const succeed = (data: PipelineResponse) => {
      if (settled) return
      settled = true
      resolve(data)
    }
    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      reject(err)
    }

    if (signal) {
      if (signal.aborted) {
        fail(new DOMException('Aborted', 'AbortError'))
        return
      }
      signal.addEventListener(
        'abort',
        () => fail(new DOMException('Aborted', 'AbortError')),
        { once: true },
      )
    }

    // 1) Fire the run. Server-side error → fatal; transport error → keep polling.
    runForecastPipeline(region, seriesIds, signal)
      .then(succeed)
      .catch((err) => {
        if (err instanceof ForecastServerError) fail(err)
        // else: dropped connection — the poll loop below recovers the result.
      })

    // 2) Poll the saved aggregate until a result newer than the baseline shows
    //    up (the run finished and flushed to disk) or we're aborted.
    void (async () => {
      while (!settled) {
        try {
          await delay(pollIntervalMs, signal)
        } catch {
          return // aborted
        }
        if (settled) return
        const data = await fetchAggregatedForecast(region).catch(() => null)
        if (!data) continue
        const ts = typeof data.generated_at === 'number' ? data.generated_at : null
        const isFresh = baseline === null ? ts !== null : ts !== null && ts > baseline
        if (isFresh) succeed(data)
      }
    })()
  })
}
