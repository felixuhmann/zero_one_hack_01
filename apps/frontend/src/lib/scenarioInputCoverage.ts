import type { PipelineResponse } from '@/types/forecast'
import { forecastPointCount } from '@/types/forecast'

const ROLE_RULES: {
  role: string
  label: string
  ruleHint: string
}[] = [
  { role: 'target', label: 'Policy target', ruleHint: 'ensemble anchor · yield-curve vs leading' },
  { role: 'inflation', label: 'Inflation', ruleHint: 'rising / falling inflation checks' },
  { role: 'labor', label: 'Labor', ruleHint: 'slack threshold on unemployment path' },
  { role: 'leading', label: 'Leading (market)', ruleHint: 'yield-curve vs funds rate' },
]

function buildRoleMap(
  configs: PipelineResponse['signal_configs'],
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const cfg of configs ?? []) {
    const role = cfg.role
    if (role && !(role in map) && cfg.series_id) {
      map[role] = cfg.series_id
    }
  }
  return map
}

function signalReady(
  signals: PipelineResponse['signals'],
  seriesId: string,
): boolean {
  const sig = signals?.[seriesId]
  if (!sig) return false
  const st = sig.status ?? sig.job?.status
  if (st === 'failed') return false
  return forecastPointCount(sig) > 0
}

/** What the pipeline ensemble and scenario classifier can use for this run. */
export function scenarioInputCoverage(aggregated: PipelineResponse | null | undefined) {
  if (!aggregated) {
    return {
      ensembleIds: [] as string[],
      droppedIds: [] as string[],
      contextInBlendOnly: [] as string[],
      roleRows: [] as {
        label: string
        seriesId: string | null
        active: boolean
        ruleHint: string
      }[],
    }
  }

  const roleMap = buildRoleMap(aggregated.signal_configs)
  const signals = aggregated.signals ?? {}
  const included = aggregated.included_series_ids ?? []

  const ensembleIds =
    aggregated.ensemble?.contributing_signals?.length
      ? [...aggregated.ensemble.contributing_signals]
      : included.filter((id) => signalReady(signals, id))

  const droppedIds = aggregated.ensemble?.dropped_signals ?? included.filter(
    (id) => !ensembleIds.includes(id),
  )

  const roleRows = ROLE_RULES.map(({ role, label, ruleHint }) => {
    const seriesId = roleMap[role] ?? null
    const active = seriesId != null && signalReady(signals, seriesId)
    return { label, seriesId, active, ruleHint }
  })

  const contextInBlendOnly = included.filter((id) => {
    const cfg = aggregated.signal_configs?.find((c) => c.series_id === id)
    const role = cfg?.role
    if (!role || role === 'target') return false
    if (ROLE_RULES.some((r) => r.role === role)) return false
    return ensembleIds.includes(id)
  })

  return { ensembleIds, droppedIds, contextInBlendOnly, roleRows }
}
