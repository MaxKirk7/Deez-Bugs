import { CalendarDays } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CATEGORY } from '../lib/categories'
import { dayDate, money } from '../lib/format'
import type { Category, Dashboard } from '../types'
import { Card, CardHeader, SourceTag } from './ui'

const DAY = 864e5
const CELL = 14
const GAP = 3
const ROWS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']
/** One hue, light → dark (sequential). Level 0 = no spending. */
const LEVEL_OPACITY = [0, 0.22, 0.42, 0.66, 1]

interface DayCell {
  date: string
  total: number
  count: number
  top: { merchant: string; amount: number } | null
  cats: Partial<Record<Category, number>>
}

/**
 * Calendar heatmap of daily spending, straight from the statement's rows (no model).
 * Darker = spent more that day. Hover a square for the details.
 */
export function Heatmap({ data }: { data: Dashboard }) {
  const { rows, currency } = data
  const [hover, setHover] = useState<DayCell | null>(null)

  const { weeks, levels, cutoffs, months, facts } = useMemo(() => {
    const byDay = new Map<string, DayCell>()
    for (const r of rows) {
      const date = r.trans_date_trans_time.slice(0, 10)
      const d = byDay.get(date) ?? {
        date,
        total: 0,
        count: 0,
        top: null,
        cats: {},
      }
      d.total += r.amt
      d.count += 1
      d.cats[r.category] = (d.cats[r.category] ?? 0) + r.amt
      if (!d.top || r.amt > d.top.amount) d.top = { merchant: r.merchant, amount: r.amt }
      byDay.set(date, d)
    }
    const dates = [...byDay.keys()].sort()
    // Show at most the last 26 weeks so the squares stay readable
    const last = Date.parse(dates[dates.length - 1])
    const first = Math.max(Date.parse(dates[0]), last - 26 * 7 * DAY)
    const start = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY // back to Monday

    const weeks: (DayCell | null)[][] = []
    for (let t = start; t <= last; t += DAY) {
      const i = Math.floor((t - start) / (7 * DAY))
      const date = new Date(t).toISOString().slice(0, 10)
      ;(weeks[i] ??= []).push(
        t < first
          ? null
          : (byDay.get(date) ?? {
              date,
              total: 0,
              count: 0,
              top: null,
              cats: {},
            }),
      )
    }

    // Levels from quartiles of spending days, so one huge day doesn't wash everything out
    const totals = weeks
      .flat()
      .filter((d): d is DayCell => !!d && d.total > 0)
      .map((d) => d.total)
      .sort((a, b) => a - b)
    const q = (p: number) => totals[Math.min(totals.length - 1, Math.floor(p * totals.length))]
    const cutoffs = [q(0.25), q(0.5), q(0.75)]
    const levels = (v: number) => (v <= 0 ? 0 : v <= cutoffs[0] ? 1 : v <= cutoffs[1] ? 2 : v <= cutoffs[2] ? 3 : 4)

    const months = weeks.map((w, i) => {
      const d = w.find(Boolean)
      const m = d ? new Date(d.date).toLocaleDateString('en-GB', { month: 'short' }) : ''
      const prev = i > 0 ? weeks[i - 1].find(Boolean) : null
      return !prev || (d && prev && d.date.slice(5, 7) !== prev.date.slice(5, 7)) ? m : ''
    })

    // Two plain facts, computed from the same rows
    const shown = weeks.flat().filter((d): d is DayCell => !!d)
    const all = shown.reduce((s, d) => s + d.total, 0)
    const weekend = shown.filter((d) => [0, 5, 6].includes(new Date(d.date).getUTCDay())).reduce((s, d) => s + d.total, 0)
    const busiest = shown.reduce((a, b) => (b.total > a.total ? b : a), shown[0])
    const quiet = shown.filter((d) => d.total === 0).length
    return {
      weeks,
      levels,
      cutoffs,
      months,
      facts: {
        weekendShare: weekend / all,
        busiest,
        quiet,
        days: shown.length,
      },
    }
  }, [rows])

  const width = weeks.length * (CELL + GAP) + 30
  const height = 7 * (CELL + GAP) + 20

  return (
    <Card delay={0.2}>
      <CardHeader
        icon={CalendarDays}
        title="Your spending calendar"
        subtitle="Every square is a day. The stronger the colour, the more you spent."
        action={<SourceTag kind="live">From your statement</SourceTag>}
      />
      <div className="grid gap-6 px-5 pt-5 pb-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              width={width * 2}
              className="h-auto max-w-full"
              role="img"
              aria-label="Calendar heatmap of daily spending"
            >
              {ROWS.map((r, i) =>
                r ? (
                  <text key={r} x={0} y={20 + i * (CELL + GAP) + CELL - 3} fontSize={7} fill="var(--muted)">
                    {r}
                  </text>
                ) : null,
              )}
              {months.map((m, i) =>
                m ? (
                  <text key={i} x={30 + i * (CELL + GAP)} y={10} fontSize={7} fill="var(--muted)">
                    {m}
                  </text>
                ) : null,
              )}
              {weeks.map((w, i) =>
                w.map((d, j) =>
                  d ? (
                    <rect
                      key={d.date}
                      x={30 + i * (CELL + GAP)}
                      y={20 + j * (CELL + GAP)}
                      width={CELL}
                      height={CELL}
                      rx={3.5}
                      fill={levels(d.total) === 0 ? 'var(--surface-2)' : 'var(--brand)'}
                      fillOpacity={levels(d.total) === 0 ? 1 : LEVEL_OPACITY[levels(d.total)]}
                      stroke={hover?.date === d.date ? 'var(--ink)' : 'none'}
                      strokeWidth={1.5}
                      tabIndex={0}
                      aria-label={`${dayDate(d.date)}: ${money(d.total, currency, 2)}`}
                      onMouseEnter={() => setHover(d)}
                      onFocus={() => setHover(d)}
                      onMouseLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                      className="cursor-pointer outline-none"
                    />
                  ) : null,
                ),
              )}
            </svg>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
            Less
            {LEVEL_OPACITY.map((o, i) => (
              <span
                key={i}
                className="size-3 rounded-[3px]"
                style={{
                  background: i === 0 ? 'var(--surface-2)' : 'var(--brand)',
                  opacity: i === 0 ? 1 : o,
                }}
                title={
                  i === 0
                    ? 'Nothing spent'
                    : i === 1
                      ? `Up to ${money(cutoffs[0], currency)}`
                      : i === 4
                        ? `Over ${money(cutoffs[2], currency)}`
                        : `${money(cutoffs[i - 2], currency)}–${money(cutoffs[i - 1], currency)}`
                }
              />
            ))}
            More
          </div>
        </div>

        {/* Side panel: hovered day, or two facts when nothing is hovered */}
        <div className="rounded-2xl bg-surface-2 p-4 text-sm" aria-live="polite">
          {hover ? (
            <>
              <p className="font-semibold text-ink">{dayDate(hover.date)}</p>
              <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink">{money(hover.total, currency, 2)}</p>
              <p className="text-xs text-muted">
                {hover.count} payment{hover.count === 1 ? '' : 's'}
              </p>
              {hover.top && (
                <p className="mt-3 text-xs text-ink-2">
                  Biggest: <span className="font-medium text-ink">{hover.top.merchant}</span>{' '}
                  {money(hover.top.amount, currency, 2)}
                </p>
              )}
              <ul className="mt-2 space-y-0.5 text-xs">
                {Object.entries(hover.cats)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([c, v]) => (
                    <li key={c} className="flex justify-between gap-2 text-ink-2">
                      <span>{CATEGORY[c as Category].label}</span>
                      <span className="tabular">{money(v, currency, 2)}</span>
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <ul className="space-y-3">
              <li>
                <p className="tabular text-2xl font-semibold tracking-tight text-ink">{Math.round(facts.weekendShare * 100)}%</p>
                <p className="text-xs text-ink-2">of your spending happens Fri–Sun</p>
              </li>
              <li>
                <p className="tabular text-2xl font-semibold tracking-tight text-ink">
                  {facts.quiet} <span className="text-sm font-normal text-muted">of {facts.days}</span>
                </p>
                <p className="text-xs text-ink-2">no-spend days</p>
              </li>
              <li className="text-xs text-muted">
                Biggest day: {dayDate(facts.busiest.date)}, {money(facts.busiest.total, currency)}
              </li>
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}
