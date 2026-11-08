import { Table2, TrendingUp } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { money } from '../lib/format'
import { readTokens, type Theme } from '../lib/useTheme'
import type { Currency, ForecastPoint, MonthSummary } from '../types'
import { Card, CardHeader } from './ui'

/** Cumulative spend this month (solid), the forecast (dashed) with its likely range (band), last month (grey) and the budget. */
export function ForecastChart({
  forecast,
  month,
  theme,
  currency = 'GBP',
}: {
  forecast: ForecastPoint[]
  month: MonthSummary
  theme: Theme
  currency?: Currency
}) {
  const gbp = (n: number, _d?: number) => money(n, currency)
  // Re-read the colour tokens whenever the theme changes
  const t = useMemo(() => readTokens(theme), [theme])
  const [asTable, setAsTable] = useState(false)
  // Recharts draws a range band from a [low, high] pair
  const data = useMemo(
    () => forecast.map((p) => ({ ...p, band: p.low !== null && p.high !== null ? [p.low, p.high] : null })),
    [forecast],
  )
  const today = month.days_in_month - month.days_left
  const monthShort = month.label.slice(0, 3)
  // About 5 round steps on the y-axis (500, 1,000, 2,000...), with a little headroom above the highest line
  const top = Math.max(month.projected_high, month.budget, month.last_month_total, 1) * 1.05
  const step = [100, 250, 500, 1000, 2000, 2500, 5000, 10000, 25000].find((s) => top / s <= 6) ?? 50000
  const yMax = Math.ceil(top / step) * step
  const yTicks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step)

  return (
    <Card delay={0.1} className="flex h-full flex-col">
      <CardHeader
        icon={TrendingUp}
        title="Where this month is heading"
        subtitle={`Total spent so far, and our forecast to ${month.days_in_month} ${monthShort}: likely ${gbp(month.projected_low, 0)}–${gbp(month.projected_high, 0)}`}
        action={
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-ink"
          >
            <Table2 className="size-3.5" aria-hidden /> {asTable ? 'Chart' : 'Table'}
          </button>
        }
      />

      <ul className="flex flex-wrap gap-x-5 gap-y-2 px-5 pt-4 text-xs text-ink-2 sm:px-6">
        <LegendItem label="This month">
          <span className="h-0.5 w-4 rounded-full" style={{ background: t.brand }} />
        </LegendItem>
        <LegendItem label="Forecast">
          <span className="w-4 border-t-2 border-dashed" style={{ borderColor: t.brand }} />
        </LegendItem>
        <LegendItem label="Likely range">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: t.brand, opacity: 0.18 }} />
        </LegendItem>
        <LegendItem label="Last month">
          <span className="h-0.5 w-4 rounded-full" style={{ background: t.compare }} />
        </LegendItem>
        <LegendItem label={`Usual month ${gbp(month.budget, 0)}`}>
          <span className="w-4 border-t-2 border-dotted" style={{ borderColor: t.ink2 }} />
        </LegendItem>
      </ul>

      {asTable ? (
        <ForecastTable forecast={forecast} monthShort={monthShort} currency={currency} />
      ) : (
        <div className="h-[340px] px-2 pt-2 pb-4 sm:px-3">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 16, right: 60, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="forecast-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={t.brand} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={t.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={t.grid} />
              <XAxis
                dataKey="day"
                ticks={[1, 5, 10, 15, 20, 25, month.days_in_month]}
                tickFormatter={(d) => `${d} ${monthShort}`}
                tick={{ fill: t.muted, fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: t.axis }}
                tickMargin={8}
              />
              <YAxis
                domain={[0, yMax]}
                ticks={yTicks}
                tickFormatter={(v) => gbp(v, 0)}
                tick={{ fill: t.muted, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={60}
                className="tabular"
              />
              <ReferenceLine
                y={month.budget}
                stroke={t.ink2}
                strokeDasharray="2 4"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
              <ReferenceLine
                x={today}
                stroke={t.axis}
                label={{ value: 'Today', position: 'top', fill: t.muted, fontSize: 11 }}
              />
              <Line
                dataKey="last_month"
                stroke={t.compare}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
              <Area
                dataKey="actual"
                stroke={t.brand}
                strokeWidth={2}
                fill="url(#forecast-fill)"
                dot={false}
                activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2, fill: t.brand }}
                animationDuration={900}
              />
              <Area
                dataKey="band"
                stroke="none"
                fill={t.brand}
                fillOpacity={0.14}
                activeDot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="projected"
                stroke={t.brand}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2, fill: t.brand }}
                animationBegin={700}
                animationDuration={700}
              />
              <ReferenceDot
                x={month.days_in_month}
                y={month.projected}
                r={5}
                fill={t.brand}
                stroke={t.surface}
                strokeWidth={2}
                label={{ value: gbp(month.projected, 0), position: 'right', fill: t.ink, fontSize: 12, fontWeight: 600 }}
              />
              <Tooltip
                cursor={{ stroke: t.axis, strokeWidth: 1 }}
                content={(p) => <ForecastTooltip {...p} monthShort={monthShort} budget={month.budget} currency={currency} />}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function LegendItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-2">
      {children}
      {label}
    </li>
  )
}

type TooltipProps = {
  active?: boolean
  label?: string | number
  payload?: ReadonlyArray<{ payload?: ForecastPoint }>
  monthShort: string
  budget: number
  currency: Currency
}

function ForecastTooltip({ active, payload, label, monthShort, budget, currency }: TooltipProps) {
  const gbp = (n: number, _d?: number) => money(n, currency)
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  const rows: [string, number | null, string][] = [
    ['This month', p.actual, 'text-ink'],
    ['Forecast', p.actual === null ? p.projected : null, 'text-ink'],
    ['Last month', p.last_month, 'text-ink-2'],
  ]
  return (
    <div className="min-w-44 rounded-xl border border-line bg-surface px-3.5 py-3 text-xs shadow-card">
      <p className="mb-2 font-semibold text-ink">
        {label} {monthShort}
      </p>
      {rows
        .filter(([, v]) => v !== null)
        .map(([name, v, cls]) => (
          <p key={name} className="flex justify-between gap-6 py-0.5">
            <span className="text-muted">{name}</span>
            <span className={`tabular font-medium ${cls}`}>{gbp(v!, 0)}</span>
          </p>
        ))}
      {p.actual === null && p.low !== null && p.high !== null && (
        <p className="flex justify-between gap-6 py-0.5">
          <span className="text-muted">Likely range</span>
          <span className="tabular font-medium text-ink-2">
            {gbp(p.low, 0)}–{gbp(p.high, 0)}
          </span>
        </p>
      )}
      <p className="mt-1.5 flex justify-between gap-6 border-t border-line pt-1.5">
        <span className="text-muted">Usual month</span>
        <span className="tabular font-medium text-ink-2">{gbp(budget, 0)}</span>
      </p>
    </div>
  )
}

function ForecastTable({ forecast, monthShort, currency }: { forecast: ForecastPoint[]; monthShort: string; currency: Currency }) {
  const gbp = (n: number, _d?: number) => money(n, currency)
  return (
    <div className="max-h-[300px] flex-1 overflow-auto px-5 py-4 sm:px-6">
      <table className="tabular w-full text-sm">
        <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
          <tr>
            <th className="py-2 font-medium">Day</th>
            <th className="py-2 text-right font-medium">This month</th>
            <th className="py-2 text-right font-medium">Forecast</th>
            <th className="py-2 text-right font-medium">Likely range</th>
            <th className="py-2 text-right font-medium">Last month</th>
          </tr>
        </thead>
        <tbody>
          {forecast.map((p) => (
            <tr key={p.day} className="border-t border-line">
              <td className="py-1.5 text-ink-2">
                {p.day} {monthShort}
              </td>
              <td className="py-1.5 text-right text-ink">{p.actual !== null ? gbp(p.actual, 0) : '–'}</td>
              <td className="py-1.5 text-right text-ink">{p.projected !== null ? gbp(p.projected, 0) : '–'}</td>
              <td className="py-1.5 text-right text-ink-2">
                {p.low !== null && p.high !== null ? `${gbp(p.low, 0)}–${gbp(p.high, 0)}` : '–'}
              </td>
              <td className="py-1.5 text-right text-ink-2">{p.last_month !== null ? gbp(p.last_month, 0) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
