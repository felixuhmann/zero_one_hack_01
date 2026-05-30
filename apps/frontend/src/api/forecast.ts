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

export async function runForecastPipeline(): Promise<PipelineResponse> {
  const response = await fetch(`${API_BASE}/forecast/run`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json() as Promise<PipelineResponse>
}
