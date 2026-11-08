/**
 * "Where this month is heading": a REAL forecast from the statement itself (no backend needed).
 *
 *   month       = the month of the last purchase in the statement ("today" = that day),
 *                 or the next month if the statement ends on a month's last day
 *   pace        = average spend per day over the 8 weeks before today (one-off huge days are
 *                 capped at the 95th percentile, so a big purchase doesn't skew the forecast)
 *   forecast    = spent so far + pace × days left
 *   likely range= ± 1.28 × (day-to-day spread) × √days left   (≈ 80% of outcomes)
 *   usual month = average of the full months before this one (the line to compare against)
 */
import type { ForecastPoint, MonthSummary, StatementRow } from '../types'

const DAY_MS = 864e5
const PACE_DAYS = 56

export function forecastFromRows(rows: StatementRow[]): { forecast: ForecastPoint[]; month: MonthSummary } | null {
  if (rows.length < 10) return null
  // Spend per calendar day ("YYYY-MM-DD" → total)
  const byDay = new Map<string, number>()
  for (const r of rows) {
    const day = r.trans_date_trans_time.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + r.amt)
  }
  const days = [...byDay.keys()].sort()
  const first = Date.parse(days[0])
  const today = Date.parse(days[days.length - 1])
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  const spentOn = (t: number) => byDay.get(iso(t)) ?? 0

  // Pace and spread from the last 8 weeks (or as much as the statement has)
  const window: number[] = []
  for (let t = Math.max(first, today - (PACE_DAYS - 1) * DAY_MS); t <= today; t += DAY_MS) window.push(spentOn(t))
  const cap = [...window].sort((a, b) => a - b)[Math.floor(window.length * 0.95)]
  const typical = window.map((x) => Math.min(x, cap))
  const pace = typical.reduce((a, b) => a + b, 0) / typical.length
  const sd = Math.sqrt(typical.reduce((s, x) => s + (x - pace) ** 2, 0) / typical.length)

  const last = new Date(today)
  let y = last.getUTCFullYear()
  let m = last.getUTCMonth()
  let todayDay = last.getUTCDate()
  if (todayDay === new Date(Date.UTC(y, m + 1, 0)).getUTCDate()) {
    // The statement ends on the last day of a month: forecast the whole of the next one.
    ;[y, m, todayDay] = m === 11 ? [y + 1, 0, 0] : [y, m + 1, 0]
  }
  const now = new Date(Date.UTC(y, m, 1))
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const monthStart = Date.UTC(y, m, 1)
  const cumulative = (start: number, upTo: number) => {
    let s = 0
    for (let d = 1; d <= upTo; d++) s += spentOn(start + (d - 1) * DAY_MS)
    return s
  }
  const spent = cumulative(monthStart, todayDay)

  // Last month, if the statement covers all of it
  const lastStart = Date.UTC(y, m - 1, 1)
  const lastDays = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const hasLast = first <= lastStart
  const lastTotal = hasLast ? cumulative(lastStart, lastDays) : 0

  // Usual month = average of the full months before this one
  const fullMonths: number[] = []
  for (let k = 1; k <= 12; k++) {
    const start = Date.UTC(y, m - k, 1)
    if (start < first) break
    fullMonths.push(cumulative(start, new Date(Date.UTC(y, m - k + 1, 0)).getUTCDate()))
  }

  const at = (day: number) => spent + pace * (day - todayDay)
  const spread = (day: number) => 1.28 * sd * Math.sqrt(Math.max(0, day - todayDay))
  const forecast: ForecastPoint[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const future = day >= todayDay
    return {
      day,
      actual: day <= todayDay ? Math.round(cumulative(monthStart, day)) : null,
      // (day 1 of a fully-future month starts from 0 + one day's pace)
      projected: future ? Math.round(at(day)) : null,
      low: future ? Math.round(Math.max(spent, at(day) - spread(day))) : null,
      high: future ? Math.round(at(day) + spread(day)) : null,
      last_month: hasLast ? Math.round(cumulative(lastStart, Math.min(day, lastDays))) : null,
    }
  })
  const end = forecast[daysInMonth - 1]
  const projected = end.projected ?? spent
  return {
    forecast,
    month: {
      label: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      days_in_month: daysInMonth,
      days_left: daysInMonth - todayDay,
      budget: Math.round(fullMonths.length ? fullMonths.reduce((a, b) => a + b, 0) / fullMonths.length : projected),
      spent: Math.round(spent),
      projected: Math.round(projected),
      projected_low: end.low ?? Math.round(spent),
      projected_high: end.high ?? Math.round(spent),
      last_month_total: Math.round(lastTotal),
    },
  }
}
