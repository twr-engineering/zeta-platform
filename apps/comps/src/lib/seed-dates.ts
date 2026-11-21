import { manilaISO } from './format'

/** Appendix D.3 date rules: `{q, day}` (day of the quarter q quarters back), `{abs}` or `{today}`. */
export type SeedDate = { q: number; day: number } | { abs: string } | { today: true }

export function resolveSeedDate(rule: SeedDate, now: Date = new Date()): string {
  const today = manilaISO(now)
  if ('today' in rule) return today
  if ('abs' in rule) return rule.abs
  const [y, m] = today.split('-').map(Number)
  const qStartMonth = Math.floor((m - 1) / 3) * 3 - rule.q * 3 // 0-based, may be negative
  const start = Date.UTC(y, qStartMonth, 1) // Date.UTC normalises negative months into earlier years
  return new Date(start + (rule.day - 1) * 86_400_000).toISOString().slice(0, 10)
}
