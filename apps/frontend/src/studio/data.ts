/*
 * Mock domain data + a small, transparent decision model for the prototype.
 *
 * Nothing here calls a real API. The shapes mirror what the Sybilion pipeline
 * returns (probabilistic month-by-month bands, driver importance per horizon,
 * backtest accuracy) so the UI is faithful, and the decision model is
 * deliberately legible + reactive so assumption shifts visibly move the call.
 */

export type Decision = "cut" | "hold" | "hike";
export type Confidence = "high" | "medium" | "low";

export interface Country {
  code: string;
  name: string;
  bank: string;
  rate: string;
  status: "live" | "soon";
  iso3: string | null; // matches the world GeoJSON feature id (null = no single polygon)
  lon: number; // marker longitude
  lat: number; // marker latitude
}

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", bank: "Federal Reserve", rate: "3.50–3.75%", status: "live", iso3: "USA", lon: -98, lat: 39 },
  { code: "EU", name: "Euro Area", bank: "European Central Bank", rate: "2.15%", status: "soon", iso3: null, lon: 10, lat: 50 },
  { code: "GB", name: "United Kingdom", bank: "Bank of England", rate: "4.00%", status: "soon", iso3: "GBR", lon: -1.5, lat: 53 },
  { code: "JP", name: "Japan", bank: "Bank of Japan", rate: "0.50%", status: "soon", iso3: "JPN", lon: 138, lat: 37 },
  { code: "CA", name: "Canada", bank: "Bank of Canada", rate: "2.75%", status: "soon", iso3: "CAN", lon: -106, lat: 58 },
  { code: "AU", name: "Australia", bank: "Reserve Bank of Australia", rate: "3.85%", status: "soon", iso3: "AUS", lon: 134, lat: -25 },
  { code: "BR", name: "Brazil", bank: "Banco Central do Brasil", rate: "13.25%", status: "soon", iso3: "BRA", lon: -52, lat: -10 },
  { code: "IN", name: "India", bank: "Reserve Bank of India", rate: "5.50%", status: "soon", iso3: "IND", lon: 79, lat: 22 },
];

/* ----------------------------- Calibration ----------------------------- */

export interface ChoiceCard {
  id: string;
  label: string;
  blurb: string;
}

export interface CalibrationState {
  mandate: number; // 0 = pure price stability, 100 = max employment
  risk: number; // 0 = act only on strong evidence, 100 = act preemptively
  horizon: 3 | 6;
  temperament: string;
  inflationTolerance: number; // pp above 2% target the chair will tolerate
}

export const DEFAULT_CALIBRATION: CalibrationState = {
  mandate: 42,
  risk: 38,
  horizon: 6,
  temperament: "data-dependent",
  inflationTolerance: 1.0,
};

export const TEMPERAMENTS: ChoiceCard[] = [
  {
    id: "data-dependent",
    label: "Data-dependent",
    blurb: "Move only as incoming data confirm the outlook. Powell's default stance.",
  },
  {
    id: "preemptive",
    label: "Preemptive",
    blurb: "Act ahead of the data to get in front of long-and-variable lags.",
  },
  {
    id: "rules-based",
    label: "Rules-based",
    blurb: "Anchor to Taylor-type benchmarks and r-star; treat judgment as a cross-check.",
  },
];

/* --------------------------- Data sources --------------------------- */

export type SignalRole = "target" | "leading" | "inflation" | "labor" | "context";

export interface DataSource {
  seriesId: string;
  title: string;
  role: SignalRole;
  source: string;
  cadence: string;
  points: number; // available monthly observations
  minRequired: number;
  weight: number; // 0..1 agent-proposed weight
  rationale: string;
  keywords: string[];
  recommended: boolean; // agent's default include
}

export const PROPOSED_SOURCES: DataSource[] = [
  {
    seriesId: "FEDFUNDS",
    title: "Effective Federal Funds Rate",
    role: "target",
    source: "FRED",
    cadence: "Monthly",
    points: 312,
    minRequired: 120,
    weight: 0.3,
    rationale: "The policy target itself — anchors the forecast to the current 3.50–3.75% range.",
    keywords: ["federal funds rate", "FOMC", "monetary policy", "Fed pivot"],
    recommended: true,
  },
  {
    seriesId: "PCEPILFE",
    title: "Core PCE Inflation (YoY)",
    role: "inflation",
    source: "FRED",
    cadence: "Monthly",
    points: 312,
    minRequired: 120,
    weight: 0.25,
    rationale: "The Fed's preferred inflation gauge. You told me price stability leans heavy — this is the spine of that read.",
    keywords: ["core PCE", "inflation", "Fed target", "disinflation"],
    recommended: true,
  },
  {
    seriesId: "DGS2",
    title: "2-Year Treasury Yield",
    role: "leading",
    source: "FRED",
    cadence: "Monthly",
    points: 312,
    minRequired: 120,
    weight: 0.25,
    rationale: "Market-implied path of policy. Leads the funds rate and encodes what traders expect you to do.",
    keywords: ["2-year treasury", "rate expectations", "yield curve"],
    recommended: true,
  },
  {
    seriesId: "UNRATE",
    title: "Unemployment Rate",
    role: "labor",
    source: "FRED",
    cadence: "Monthly",
    points: 312,
    minRequired: 120,
    weight: 0.2,
    rationale: "The employment half of the dual mandate. Downside labor risk is the live tension in 2026.",
    keywords: ["unemployment", "labor market", "dual mandate", "labor slack"],
    recommended: true,
  },
  {
    seriesId: "CES0500000003",
    title: "Average Hourly Earnings (YoY)",
    role: "context",
    source: "FRED",
    cadence: "Monthly",
    points: 228,
    minRequired: 120,
    weight: 0.12,
    rationale: "Wage growth — a sticky-inflation cross-check. Optional given your inflation focus.",
    keywords: ["wage growth", "labor costs", "sticky inflation"],
    recommended: false,
  },
  {
    seriesId: "NFCI",
    title: "Chicago Fed Financial Conditions",
    role: "context",
    source: "FRED",
    cadence: "Weekly → Monthly",
    points: 204,
    minRequired: 120,
    weight: 0.1,
    rationale: "The transmission channel. Conditions can tighten without a rate move and substitute for one.",
    keywords: ["financial conditions", "credit spreads", "transmission"],
    recommended: false,
  },
  {
    seriesId: "PAYEMS",
    title: "Nonfarm Payrolls (Δ, 000s)",
    role: "labor",
    source: "FRED",
    cadence: "Monthly",
    points: 312,
    minRequired: 120,
    weight: 0.1,
    rationale: "Marquee jobs print. Heavy revisions in 2025 changed the read — include if you weight labor momentum.",
    keywords: ["nonfarm payrolls", "job growth", "jobs report"],
    recommended: false,
  },
];

export const ROLE_LABEL: Record<SignalRole, string> = {
  target: "Policy target",
  leading: "Leading market signal",
  inflation: "Inflation",
  labor: "Labor",
  context: "Context",
};

/* --------------------------- Time series --------------------------- */

export interface SeriesPoint {
  t: string; // YYYY-MM
  v: number;
}

export interface BandPoint {
  t: string;
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  history?: number; // present only on the seam / past
}

function monthLabel(offsetFromAnchor: number): string {
  // anchor = 2026-05
  const base = new Date(Date.UTC(2026, 4, 1));
  base.setUTCMonth(base.getUTCMonth() + offsetFromAnchor);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Hand-shaped recent history of the effective funds rate (the hiking cycle peak
// at 5.33%, three late-2025 cuts down to the 3.50–3.75% range).
const FUNDS_HISTORY: number[] = [
  5.33, 5.33, 5.33, 5.33, 5.33, 5.33, 5.13, 4.83, 4.58, 4.33, 4.33, 4.33, 4.33,
  4.33, 4.33, 4.08, 3.83, 3.63, 3.63, 3.63,
];

export function fundsHistory(): SeriesPoint[] {
  const n = FUNDS_HISTORY.length;
  return FUNDS_HISTORY.map((v, i) => ({ t: monthLabel(-(n - 1) + i), v }));
}

export const CURRENT_RATE = 3.625;

/**
 * Build a probabilistic fan for the funds rate.
 * `driftBps` is the cumulative change over 12 months implied by the decision
 * tilt (negative = easing). Uncertainty widens with horizon.
 */
export function buildForecastBand(driftBps: number, volScale = 1): BandPoint[] {
  const out: BandPoint[] = [];
  const start = CURRENT_RATE;
  const drift = driftBps / 100;
  // seam point (now) so history and forecast connect
  out.push({
    t: monthLabel(0),
    p05: start,
    p25: start,
    p50: start,
    p75: start,
    p95: start,
    history: start,
  });
  for (let m = 1; m <= 12; m++) {
    const frac = m / 12;
    // ease-in path toward the drifted terminal
    const median = start + drift * (1 - Math.pow(1 - frac, 1.7));
    const sigma = (0.18 + 0.5 * Math.sqrt(frac)) * volScale;
    out.push({
      t: monthLabel(m),
      p05: round(median - 1.64 * sigma),
      p25: round(median - 0.67 * sigma),
      p50: round(median),
      p75: round(median + 0.67 * sigma),
      p95: round(median + 1.64 * sigma),
    });
  }
  return out;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/* ------------------ Per-series Sybilion forecasts ------------------ */

interface SeriesConfig {
  unit: string;
  decimals: number;
  vol: number; // band sigma scale, in value units
  terminal: number; // model median at the +12m horizon
  history: number[]; // oldest -> newest monthly observations
  read: string; // one-line Sybilion read on the forecast
}

// Hand-shaped recent histories + a plausible 12-month median path per signal.
// Mirrors the funds-rate fan so every selected input gets its own probabilistic
// forecast the user can tab through.
const SERIES_CONFIG: Record<string, SeriesConfig> = {
  PCEPILFE: {
    unit: "%",
    decimals: 1,
    vol: 0.12,
    terminal: 2.5,
    history: [3.6, 3.5, 3.5, 3.4, 3.3, 3.3, 3.2, 3.2, 3.1, 3.1, 3.0, 3.0, 3.0, 3.0],
    read: "Disinflation continues but stalls ~0.5pp above target — the last mile is sticky.",
  },
  DGS2: {
    unit: "%",
    decimals: 2,
    vol: 0.16,
    terminal: 3.35,
    history: [4.6, 4.42, 4.3, 4.18, 4.05, 3.96, 3.88, 3.8, 3.74, 3.7, 3.66, 3.63, 3.62, 3.62],
    read: "The 2Y drifts lower, pricing roughly one-and-a-third cuts over the year.",
  },
  UNRATE: {
    unit: "%",
    decimals: 1,
    vol: 0.12,
    terminal: 4.8,
    history: [4.0, 4.0, 4.1, 4.1, 4.2, 4.2, 4.2, 4.3, 4.3, 4.3, 4.4, 4.4, 4.4, 4.4],
    read: "Unemployment grinds higher toward ~4.8% — the live downside risk to the mandate.",
  },
  CES0500000003: {
    unit: "%",
    decimals: 1,
    vol: 0.12,
    terminal: 3.4,
    history: [4.5, 4.4, 4.4, 4.3, 4.3, 4.2, 4.1, 4.1, 4.0, 4.0, 3.95, 3.9, 3.9, 3.9],
    read: "Wage growth cools toward a 2%-consistent pace, easing sticky-inflation pressure.",
  },
  NFCI: {
    unit: "",
    decimals: 2,
    vol: 0.04,
    terminal: -0.3,
    history: [-0.45, -0.43, -0.42, -0.41, -0.4, -0.39, -0.38, -0.37, -0.36, -0.35, -0.34, -0.35, -0.35, -0.35],
    read: "Financial conditions stay modestly loose (negative = accommodative).",
  },
  PAYEMS: {
    unit: "k",
    decimals: 0,
    vol: 22,
    terminal: 90,
    history: [256, 210, 185, 170, 150, 142, 135, 128, 120, 118, 124, 119, 121, 120],
    read: "Payroll momentum keeps slowing toward ~90k/month — below the breakeven pace.",
  },
};

/** A generalised probabilistic fan for any series (absolute units). */
export function buildSeriesBand(start: number, terminal: number, vol: number): BandPoint[] {
  const out: BandPoint[] = [];
  const drift = terminal - start;
  out.push({ t: monthLabel(0), p05: start, p25: start, p50: start, p75: start, p95: start, history: start });
  for (let m = 1; m <= 12; m++) {
    const frac = m / 12;
    const median = start + drift * (1 - Math.pow(1 - frac, 1.7));
    const sigma = (0.4 + Math.sqrt(frac)) * vol;
    out.push({
      t: monthLabel(m),
      p05: round(median - 1.64 * sigma),
      p25: round(median - 0.67 * sigma),
      p50: round(median),
      p75: round(median + 0.67 * sigma),
      p95: round(median + 1.64 * sigma),
    });
  }
  return out;
}

export interface SeriesForecast {
  seriesId: string;
  title: string;
  unit: string;
  decimals: number;
  read: string;
  history: SeriesPoint[];
  band: BandPoint[];
  start: number;
  terminal: number;
}

export function getSeriesForecast(seriesId: string): SeriesForecast | null {
  const cfg = SERIES_CONFIG[seriesId];
  if (!cfg) return null;
  const src = PROPOSED_SOURCES.find((s) => s.seriesId === seriesId);
  const n = cfg.history.length;
  const history = cfg.history.map((v, i) => ({ t: monthLabel(-(n - 1) + i), v }));
  const start = cfg.history[n - 1];
  const band = buildSeriesBand(start, cfg.terminal, cfg.vol);
  return {
    seriesId,
    title: src?.title ?? seriesId,
    unit: cfg.unit,
    decimals: cfg.decimals,
    read: cfg.read,
    history,
    band,
    start,
    terminal: cfg.terminal,
  };
}

/* ------------------------ Driver importance ------------------------ */

export interface Driver {
  id: string;
  label: string;
  color: string;
  // importance 0..1 at horizons [1m, 3m, 6m, 12m]
  importance: [number, number, number, number];
  // signed contribution to the decision tilt (− dovish, + hawkish), latest read
  tilt: number;
  read: string;
}

export const DRIVERS: Driver[] = [
  {
    id: "corepce",
    label: "Core PCE inflation",
    color: "var(--st-hike)",
    importance: [0.92, 0.84, 0.7, 0.52],
    tilt: 0.55,
    read: "3.0% YoY — still 1.0pp above target, drifting down slowly.",
  },
  {
    id: "market",
    label: "Market-implied path (2Y)",
    color: "var(--st-brand)",
    importance: [0.86, 0.78, 0.55, 0.34],
    tilt: -0.35,
    read: "2Y at 3.62% prices ~1.3 cuts over the next year.",
  },
  {
    id: "labor",
    label: "Labor market (UNRATE)",
    color: "var(--st-cut)",
    importance: [0.4, 0.58, 0.78, 0.88],
    tilt: -0.3,
    read: "4.4% and edging up; payroll trend has slowed sharply.",
  },
  {
    id: "wages",
    label: "Wage growth",
    color: "oklch(0.78 0.13 320)",
    importance: [0.34, 0.42, 0.5, 0.46],
    tilt: 0.15,
    read: "3.9% YoY — easing but still above a 2%-consistent pace.",
  },
  {
    id: "fci",
    label: "Financial conditions",
    color: "oklch(0.8 0.1 140)",
    importance: [0.5, 0.46, 0.38, 0.3],
    tilt: -0.1,
    read: "Loosened modestly since the last meeting; mild easing impulse.",
  },
];

export const HORIZON_LABELS = ["1M", "3M", "6M", "12M"] as const;

/* --------------------------- Backtest --------------------------- */

export interface BacktestRow {
  seriesId: string;
  label: string;
  mae: number; // mean abs error (pp)
  hitRate: number; // directional hit rate 0..1
  vsNaive: number; // % improvement vs naive last-value
}

export const BACKTEST: BacktestRow[] = [
  { seriesId: "FEDFUNDS", label: "Funds rate", mae: 0.11, hitRate: 0.86, vsNaive: 0.34 },
  { seriesId: "PCEPILFE", label: "Core PCE", mae: 0.18, hitRate: 0.79, vsNaive: 0.27 },
  { seriesId: "DGS2", label: "2Y yield", mae: 0.21, hitRate: 0.74, vsNaive: 0.19 },
  { seriesId: "UNRATE", label: "Unemployment", mae: 0.14, hitRate: 0.71, vsNaive: 0.22 },
];

// One backtest overlay: predicted vs actual funds rate on a held-out window.
export function backtestOverlay(): { t: string; actual: number; pred: number }[] {
  const actual = [4.58, 4.33, 4.33, 4.33, 4.33, 4.08, 3.83, 3.63, 3.63];
  const pred = [4.55, 4.39, 4.31, 4.3, 4.28, 4.02, 3.86, 3.6, 3.62];
  return actual.map((a, i) => ({ t: monthLabel(-15 + i), actual: a, pred: pred[i] }));
}

/* --------------------- Adaptive decision model --------------------- */

export interface Assumption {
  id: string;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  baseline: number;
  hint: string;
  // how a one-unit increase pushes the tilt (+ hawkish, − dovish)
  sensitivity: number;
}

export function defaultAssumptions(): Assumption[] {
  return [
    {
      id: "corepce",
      label: "Core PCE inflation",
      unit: "% YoY",
      value: 3.0,
      min: 1.5,
      max: 5,
      step: 0.1,
      baseline: 3.0,
      hint: "Distance above the 2% target is the primary hawkish force.",
      sensitivity: 0.6,
    },
    {
      id: "unrate",
      label: "Unemployment rate",
      unit: "%",
      value: 4.4,
      min: 3.5,
      max: 7,
      step: 0.1,
      baseline: 4.4,
      hint: "Rising slack tilts the committee dovish via the employment mandate.",
      sensitivity: -0.5,
    },
    {
      id: "marketcuts",
      label: "Market-implied cuts (12m)",
      unit: "bps",
      value: -35,
      min: -150,
      max: 75,
      step: 5,
      baseline: -35,
      hint: "What the 2Y curve already prices. Fighting it is costly.",
      sensitivity: 0.006,
    },
    {
      id: "expectations",
      label: "LR inflation expectations",
      unit: "%",
      value: 2.3,
      min: 1.8,
      max: 3.5,
      step: 0.1,
      baseline: 2.3,
      hint: "If long-run expectations un-anchor, this overrides almost everything.",
      sensitivity: 0.9,
    },
  ];
}

export interface DriverContribution {
  label: string;
  value: number; // signed tilt contribution
  detail: string;
}

export interface DecisionResult {
  decision: Decision;
  bps: number; // signed basis-point move recommended at the next meeting
  confidence: Confidence;
  tilt: number; // continuous score, − dovish .. + hawkish
  referenceTilt?: number; // chair-path tilt before assumption shifts (faded needle)
  headline: string;
  headlineDetail?: string; // how the chair path + assumptions round to the call
  rationale: string[];
  contributions: DriverContribution[];
  pathStepBps?: number; // chair ensemble path's first forward step
  assumptionStepBps?: number; // bps added by assumption shifts vs the forecast
  dissent: string;
}

/* --------------------- Processing simulation --------------------- */

export interface JobStage {
  key: string;
  label: string;
}

export const JOB_STAGES: JobStage[] = [
  { key: "submit", label: "Submitting payload" },
  { key: "queue", label: "Queued" },
  { key: "forecast", label: "Probabilistic forecast" },
  { key: "drivers", label: "Scoring drivers" },
  { key: "backtest", label: "Backtest validation" },
  { key: "done", label: "Settled" },
];

export const PROCESSING_FACTS: string[] = [
  "Romer & Romer (2000): optimal forecasts put weight near 1.0 on staff models, ~0 on private forecasts.",
  "Wide confidence bands aren't noise — they encode when not to act.",
  "Driver importance shifts by horizon: market path dominates month one, labor by month twelve.",
  "The engine returns month-by-month outcome bands, not a single point estimate.",
  "Core PCE is the Fed's preferred gauge — broader basket, dynamic reweighting vs CPI.",
  "The dot plot is a reaction function, not a plan — it gets dated quickly.",
];
