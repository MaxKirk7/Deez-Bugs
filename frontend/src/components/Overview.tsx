import { motion } from 'motion/react'
import { ArrowRight, Target } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { groupName, money, pct } from '../lib/format'
import type { forecastFromRows } from '../lib/forecast'
import type { PageId } from '../lib/pages'
import type { Dashboard } from '../types'
import { ScoreRing } from './Hero'
import { SpendingMap } from './SpendingMap'
import { Card, IconTile, SourceTag } from './ui'

/**
 * HOME: the one-screen summary. Everything here links to its own page for the detail.
 *   headline + the one thing to change (with a what-if) · score · map · explore tiles
 */
export function Overview({
  data,
  forecast,
  onNavigate,
}: {
  data: Dashboard
  forecast: ReturnType<typeof forecastFromRows>
  onNavigate: (page: PageId) => void
}) {
  const { insights, user, mode, currency, rows } = data
  const rec = insights.recommendations[0]
  const top = insights.categories[0]
  // What if: cut the biggest-win category by this much → real money per month
  const [cut, setCut] = useState(20)
  const recMonthly = rec ? insights.monthly_spend * rec.your_share : 0
  const whatIf = (recMonthly * cut) / 100

  // Explore tiles: one real number from each page
  const weekend = rows.filter((r) => [0, 5, 6].includes(new Date(r.trans_date_trans_time.slice(0, 10) + 'T00:00:00Z').getUTCDay()))
  const total = rows.reduce((s, r) => s + r.amt, 0) || 1
  const weekendShare = weekend.reduce((s, r) => s + r.amt, 0) / total

  return (
    <div className="space-y-5">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="pt-8 sm:pt-12">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">Hi {user.name}</p>
          <SourceTag kind={mode === 'live' ? 'live' : 'placeholder'}>{mode === 'live' ? 'Live model output' : 'Placeholder · backend offline'}</SourceTag>
        </div>
        <h1 className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-balance text-ink sm:text-5xl">
          {rec ? (
            <>
              Your one thing this month:{' '}
              <span className="bg-gradient-to-r from-brand to-violet bg-clip-text text-transparent">{rec.label.toLowerCase()}.</span>
            </>
          ) : (
            <>
              You spend like the{' '}
              <span className="bg-gradient-to-r from-brand to-violet bg-clip-text text-transparent">{groupName(insights.segment.name)}</span> crowd.
            </>
          )}
        </h1>
        <p className="mt-3 text-sm text-muted">
          From {rows.length} payments in <span className="font-mono">{data.filename}</span> · about {money(insights.monthly_spend, currency)} a month ·
          compared with {insights.neighbours.length} similar people out of 908
        </p>
      </motion.section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card className="flex flex-col p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <IconTile icon={Target} />
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Your biggest win</h2>
              <p className="text-sm text-muted">Where you spend more than people like you</p>
            </div>
          </div>
          {rec ? (
            <>
              <p className="mt-5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">Bring {rec.label} closer to people like you.</p>
              <div className="relative mt-4 h-2.5 rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-gradient-to-r from-brand to-violet" style={{ width: `${Math.min(100, rec.your_share * 100)}%` }} />
                <div className="absolute -top-1 h-4.5 w-0.5 rounded bg-ink" style={{ left: `${Math.min(100, rec.neighbours_share * 100)}%` }} />
              </div>
              <p className="mt-2 flex flex-wrap gap-x-5 text-sm text-ink-2">
                <span>
                  You: <b className="text-ink">{pct(rec.your_share)}</b> of your money
                </span>
                <span>
                  People like you: <b className="text-ink">{pct(rec.neighbours_share)}</b>
                </span>
              </p>
              <div className="mt-5 rounded-2xl bg-surface-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label htmlFor="what-if" className="text-sm text-ink-2">
                    What if you cut {rec.label.toLowerCase()} by <b className="tabular text-ink">{cut}%</b>?
                  </label>
                  <p className="tabular text-sm text-ink-2">
                    <b className="text-lg text-good-text">{money(whatIf, currency)}</b>/month · {money(whatIf * 12, currency)}/year
                  </p>
                </div>
                <input
                  id="what-if"
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={cut}
                  onChange={(e) => setCut(Number(e.target.value))}
                  className="slider mt-3 w-full"
                  style={{ ['--fill' as string]: `${((cut - 5) / 45) * 100}%` }}
                />
                <p className="mt-1 text-xs text-muted">You spend about {money(recMonthly, currency)} a month on it now.</p>
              </div>
              <div className="min-h-5 flex-1" />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-sm text-ink-2">
                  Matching them frees up about <b className="text-good-text">{money(rec.est_monthly_saving, currency)} a month</b>, or{' '}
                  {money(rec.est_monthly_saving * 12, currency)} a year.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('recommendations')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-surface-solid transition-transform hover:-translate-y-0.5"
                >
                  Set it as a goal <ArrowRight className="size-4" aria-hidden />
                </button>
              </div>
            </>
          ) : (
            <p className="mt-5 text-lg text-ink-2">Your spending mix is in line with people like you. Nothing big to fix.</p>
          )}
        </Card>

        <Card className="flex flex-col items-center p-5 text-center sm:p-6">
          <h2 className="self-start text-[15px] font-semibold text-ink">How you compare</h2>
          <ScoreRing score={insights.score} />
          <p className="mt-1 text-xs text-muted">Group: {groupName(insights.segment.name)}</p>
          <button type="button" onClick={() => onNavigate('compare')} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand">
            See the comparison <ArrowRight className="size-4" aria-hidden />
          </button>
        </Card>
      </div>

      <SpendingMap data={data} />

      <section className="space-y-3 pt-2">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Explore</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Fraud check" onClick={() => onNavigate('unusual')} value={`${data.unusual.rows.length}`}>
            {data.unusual.rows.length === 1 ? 'thing to check' : 'things to check'} in your statement
          </Tile>
          <Tile label="Compare" onClick={() => onNavigate('compare')} value={top ? `${pct(top.your_share)} vs ${pct(top.neighbours_share)}` : '–'}>
            {top ? `${top.label}: you vs people like you` : 'Your mix vs people like you'}
          </Tile>
          <Tile label="Patterns" onClick={() => onNavigate('forecast')} value={pct(weekendShare)}>
            of your spending happens Friday to Sunday
          </Tile>
          <Tile
            label="Forecast"
            onClick={() => onNavigate('forecast')}
            value={forecast ? `${money(forecast.month.projected_low, currency)}–${money(forecast.month.projected_high, currency)}` : '–'}
          >
            {forecast ? `likely spend by ${forecast.month.days_in_month} ${forecast.month.label.slice(0, 3)}` : 'Not enough data to forecast'}
          </Tile>
        </div>
      </section>

    </div>
  )
}

function Tile({ label, value, onClick, children }: { label: string; value: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass group rounded-3xl border border-line p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/50"
    >
      <p className="flex items-center justify-between text-xs font-semibold tracking-widest text-brand uppercase">
        {label} <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm text-ink-2">{children}</p>
    </button>
  )
}
