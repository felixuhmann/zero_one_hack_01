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

/** Run the Fed/ECB pipeline for the series selected in Decision Studio. */
export async function runForecastPipeline(
  region = 'fed',
  seriesIds?: string[],
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
    },
  )

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
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
