import {
  type Assumption,
  type CalibrationState,
  type Confidence,
  type Decision,
  type DecisionResult,
  type DriverContribution,
} from '@/studio/data'
import {
  chairEnsembleNextStep,
  type ChairEnsembleStep,
} from '@/lib/chairEnsemble'
import type { PipelineResponse, ScenarioResult } from '@/types/forecast'

/*
 * Unified next-meeting decision (Design A).
 *
 * The call is literally the chair-weighted ensemble path's first forward step —
 * the same line the forecast step draws — decomposed by signal so the "why"
 * bars sum to the headline. The assumption sliders layer macro *surprises vs
 * the forecast* on top: at baseline they contribute zero, so the headline
 * equals the line's first move; shifting one adds bps and the call adapts.
 */

/** bps added to the next-meeting step per unit of deviation from the forecast. */
const ASSUMPTION_BPS_SENSITIVITY: Record<string, number> = {
  corepce: 20, // +1pp inflation surprise → +20 bp hawkish
  unrate: -28, // +1pp unemployment surprise → −28 bp dovish
  marketcuts: 0.22, // per bp of extra market-priced easing → dovish
  expectations: 45, // +1pp un-anchoring → +45 bp hawkish (acts forcefully)
}

/** Which contribution bucket each assumption shares a bar with. */
const ASSUMPTION_BUCKET: Record<string, string> = {
  corepce: 'inflation',
  unrate: 'labor',
  marketcuts: 'leading',
  expectations: 'expectations',
}

const BUCKET_LABEL: Record<string, string> = {
  inflation: 'Inflation path',
  labor: 'Labor path',
  leading: 'Market-implied path',
  target: 'Policy anchor',
  context: 'Other signals',
  expectations: 'Expectations anchor',
}

const BUCKET_ORDER = ['inflation', 'labor', 'leading', 'target', 'context']

function bucketForRole(role: string): string {
  if (role === 'inflation' || role === 'labor' || role === 'leading' || role === 'target') {
    return role
  }
  return 'context'
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function fmtBps(v: number): string {
  const r = Math.round(v)
  return `${r >= 0 ? '+' : ''}${r} bp`
}

function fmtAssumption(value: number, unit: string, step: number): string {
  const sign = value > 0 && unit === 'bps' ? '+' : ''
  return `${sign}${value.toFixed(step < 1 ? 1 : 0)} ${unit}`
}

function biasLabel(stepBps: number): string {
  if (stepBps <= -4) return 'Hold · easing bias'
  if (stepBps >= 4) return 'Hold · tightening bias'
  return 'Hold · neutral'
}

interface Bucket {
  pathBps: number
  signals: string[]
  devBps: number
  devNote: string | null
}

export function deriveNextMeetingDecision(
  aggregated: PipelineResponse | null | undefined,
  cal: CalibrationState,
  assumptions: Assumption[],
  chairScenario?: ScenarioResult | null,
): DecisionResult {
  const step: ChairEnsembleStep = aggregated
    ? chairEnsembleNextStep(aggregated, cal)
    : { available: false, currentDate: null, nextDate: null, current: null, next: null, stepBps: 0, perSignal: [] }

  const buckets = new Map<string, Bucket>()
  const ensure = (key: string): Bucket => {
    let b = buckets.get(key)
    if (!b) {
      b = { pathBps: 0, signals: [], devBps: 0, devNote: null }
      buckets.set(key, b)
    }
    return b
  }

  // path step, bucketed by signal role
  for (const ps of step.perSignal) {
    const b = ensure(bucketForRole(ps.role))
    b.pathBps += ps.contributionBps
    b.signals.push(ps.seriesId)
  }

  // assumption surprises vs the forecast baseline
  let assumptionStepBps = 0
  for (const a of assumptions) {
    const sens = ASSUMPTION_BPS_SENSITIVITY[a.id]
    if (sens == null) continue
    const dev = (a.value - a.baseline) * sens
    assumptionStepBps += dev
    const b = ensure(ASSUMPTION_BUCKET[a.id] ?? a.id)
    b.devBps += dev
    const moved = Math.abs(a.value - a.baseline) > 1e-9
    b.devNote = moved
      ? `your ${fmtAssumption(a.value, a.unit, a.step)} vs ${fmtAssumption(a.baseline, a.unit, a.step)} forecast ${fmtBps(dev)}`
      : `at the forecast ${fmtAssumption(a.baseline, a.unit, a.step)}`
  }

  const contributions: DriverContribution[] = []
  const pushBucket = (key: string) => {
    const b = buckets.get(key)
    if (!b) return
    const value = b.pathBps + b.devBps
    const parts: string[] = []
    if (b.signals.length) {
      parts.push(`forecast path ${fmtBps(b.pathBps)} (${b.signals.join(', ')})`)
    } else if (key !== 'expectations') {
      parts.push(`forecast path ${fmtBps(b.pathBps)}`)
    }
    if (b.devNote) parts.push(b.devNote)
    let detail = parts.join('; ')
    detail = detail.charAt(0).toUpperCase() + detail.slice(1) + '.'
    contributions.push({ label: BUCKET_LABEL[key] ?? key, value, detail })
  }
  for (const key of BUCKET_ORDER) pushBucket(key)
  pushBucket('expectations')
  contributions.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  const pathStepBps = step.stepBps
  const adjustedStepBps = pathStepBps + assumptionStepBps
  const snapped = clamp(Math.round(adjustedStepBps / 25) * 25, -50, 50)

  let decision: Decision = 'hold'
  let bps = 0
  if (snapped <= -25) {
    decision = 'cut'
    bps = snapped
  } else if (snapped >= 25) {
    decision = 'hike'
    bps = snapped
  }

  const tilt = clamp(adjustedStepBps / 33.333, -1.5, 1.5)
  const referenceTilt = clamp(pathStepBps / 33.333, -1.5, 1.5)

  const headline =
    decision === 'cut'
      ? `Cut ${Math.abs(bps)} bps`
      : decision === 'hike'
        ? `Hike ${bps} bps`
        : biasLabel(adjustedStepBps)

  const detailParts = [`Chair path's first step ${fmtBps(pathStepBps)}`]
  if (Math.abs(assumptionStepBps) >= 0.5) {
    detailParts.push(`assumptions ${fmtBps(assumptionStepBps)}`)
  }
  detailParts.push(snapped === 0 ? '→ rounds to hold' : `→ rounds to ${fmtBps(snapped)}`)
  const headlineDetail = detailParts.join(' · ')

  // confidence: signal agreement + decisiveness + classifier confidence
  const signs = contributions.map((c) => Math.sign(c.value)).filter((s) => s !== 0)
  const net = Math.sign(adjustedStepBps)
  const agree =
    signs.length && net !== 0 ? signs.filter((s) => s === net).length / signs.length : 0.5
  const magnitude = Math.min(Math.abs(adjustedStepBps) / 40, 1)
  const scenConf = chairScenario
    ? { high: 1, medium: 0.6, low: 0.3 }[chairScenario.confidence] ?? 0.5
    : 0.5
  const score = 0.4 * agree + 0.35 * magnitude + 0.25 * scenConf
  const confidence: Confidence = score > 0.66 ? 'high' : score > 0.42 ? 'medium' : 'low'

  const dovish = contributions.filter((c) => c.value < -0.5).length
  const hawkish = contributions.filter((c) => c.value > 0.5).length
  const n = Math.max(dovish + hawkish, 1)
  const dissent =
    decision === 'cut'
      ? `Expect a hawkish dissent (à la Schmid/Goolsbee, Dec 2025) — ${hawkish}/${n} drivers still lean tighter.`
      : decision === 'hike'
        ? `Expect a dovish dissent (à la Miran) flagging labor downside — ${dovish}/${n} drivers still lean easier.`
        : `Split read: ${dovish} dovish vs ${hawkish} hawkish drivers; a 2026-style multi-way dissent is likely on any move.`

  const rationale: string[] = []
  if (step.available) {
    rationale.push(
      `The next-meeting call is the chair path's first forward step (${fmtBps(pathStepBps)}) — the same line shown on the forecast step.`,
    )
  } else {
    rationale.push(
      'No usable chair-ensemble horizon; the call rests on your assumption shifts alone.',
    )
  }
  if (Math.abs(assumptionStepBps) >= 0.5) {
    rationale.push(
      `Your assumption shifts add ${fmtBps(assumptionStepBps)} of macro surprise on top of the forecast path.`,
    )
  }
  if (chairScenario) {
    rationale.push(
      `Scenario classifier (3–6m trend): ${chairScenario.scenario} · Δ3m ${chairScenario.delta_3m >= 0 ? '+' : ''}${chairScenario.delta_3m}pp.`,
    )
  }

  return {
    decision,
    bps,
    confidence,
    tilt,
    referenceTilt,
    headline,
    headlineDetail,
    rationale,
    contributions,
    pathStepBps,
    assumptionStepBps,
    dissent,
  }
}
