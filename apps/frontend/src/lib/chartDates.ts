/** Normalize Sybilion/FRED month keys to `YYYY-MM-DD` for chart joins. */
export function normalizeChartDate(t: string): string {
  const s = t.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`
  return s
}
