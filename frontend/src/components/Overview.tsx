import { motion } from 'motion/react'
import { ArrowRight, PiggyBank, TrendingDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { CATEGORY } from '../lib/categories'
import { money, pct } from '../lib/format'
import type { forecastFromRows } from '../lib/forecast'
import type { PageId } from '../lib/pages'
import type { Category, Dashboard } from '../types'
import { SpendingMap } from './SpendingMap'
import { ScoreRing } from './Hero'
import { Card, SourceTag } from './ui'

/**
 * HOME: the one-screen summary. Everything here links to its own page for the detail.
 *   left: you could save up to £X + biggest expense · right: Penny score · map · explore tiles
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
  const top = insights.categories[0]

  // "You could save up to £X with Penny": the model's recommendations, added up
  const saveMonthly = insights.recommendations.reduce((s, r) => s + r.est_monthly_saving, 0)

  // "Your biggest expense this month": the category with the most money in the statement's latest month
  const month = rows.reduce((m, r) => (r.trans_date_trans_time.slice(0, 7) > m ? r.trans_date_trans_time.slice(0, 7) : m), '')
  const inMonth = rows.filter((r) => r.trans_date_trans_time.startsWith(month))
  const monthTotal = inMonth.reduce((s, r) => s + r.amt, 0) || 1
  const byCat = new Map<Category, number>()
  for (const r of inMonth) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amt)
  const [bigCat, bigAmount] = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
  const bigShops = new Map<string, number>()
  for (const r of inMonth) if (r.category === bigCat) bigShops.set(r.merchant, (bigShops.get(r.merchant) ?? 0) + r.amt)
  const [bigShop] = [...bigShops.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null]
  const vsPeople = bigCat ? insights.categories.find((c) => c.category === bigCat) : undefined
  const monthLabel = month ? new Date(month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }) : 'this month'

  // Explore tiles: one real number from each page
  const weekend = rows.filter((r) => [0, 5, 6].includes(new Date(r.trans_date_trans_time.slice(0, 10) + 'T00:00:00Z').getUTCDay()))
  const total = rows.reduce((s, r) => s + r.amt, 0) || 1
  const weekendShare = weekend.reduce((s, r) => s + r.amt, 0) / total

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 pt-8 sm:pt-12">
        <p className="text-sm text-muted">Hi {user.name}</p>
        <SourceTag kind={mode === 'live' ? 'live' : 'placeholder'}>{mode === 'live' ? 'Live model output' : 'Placeholder · backend offline'}</SourceTag>
      </div>

      {/* Left: what you can do (save, biggest expense). Right: your Penny score. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex flex-col gap-5">
        {/* You could save up to £X → the savings / trade-offs page */}
        <button
          type="button"
          onClick={() => onNavigate('recommendations')}
          className="group flex flex-col rounded-3xl border border-brand/40 bg-brand-soft p-6 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-brand sm:p-7"
        >
          <span className="flex items-center gap-2 text-xs font-semibold tracking-widest text-brand uppercase">
            <PiggyBank className="size-4" aria-hidden /> With Penny
          </span>
          {saveMonthly > 0 ? (
            <>
              <span className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                You could save up to <span className="text-good-text">{money(saveMonthly, currency)}</span> a month
              </span>
              <span className="mt-2 text-ink-2">
                That’s {money(saveMonthly * 12, currency)} a year, from {insights.recommendations.length} change
                {insights.recommendations.length === 1 ? '' : 's'} people like you already make.
              </span>
            </>
          ) : (
            <span className="mt-3 text-2xl font-semibold tracking-tight text-ink">Your spending is already in line with people like you.</span>
          )}
          <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-brand">
            See the trade-offs and how to save <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </button>

        {/* Your biggest expense this month */}
        <Card className="flex flex-col p-6 sm:p-7">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted uppercase">
            <TrendingDown className="size-4" aria-hidden /> Your biggest expense in {monthLabel}
          </p>
          {bigCat ? (
            <>
              <p className="mt-3 flex items-center gap-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {(() => {
                  const Icon = CATEGORY[bigCat].icon
                  return <Icon className="size-7 text-brand" aria-hidden />
                })()}
                {CATEGORY[bigCat].label}
              </p>
              <p className="mt-2 text-ink-2">
                <b className="text-ink">{money(bigAmount, currency)}</b>, {pct(bigAmount / monthTotal)} of everything you spent
                {bigShop ? (
                  <>
                    , mostly at <b className="text-ink">{bigShop}</b>
                  </>
                ) : null}
                .
              </p>
              {vsPeople && (
                <p className="mt-auto border-t border-line pt-4 text-sm text-ink-2">
                  {vsPeople.your_share > vsPeople.neighbours_share * 1.1
                    ? `Over your whole statement it’s ${pct(vsPeople.your_share)} of your money. People like you spend ${pct(vsPeople.neighbours_share)}.`
                    : `Over your whole statement it’s ${pct(vsPeople.your_share)} of your money, about the same as people like you (${pct(vsPeople.neighbours_share)}).`}
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-ink-2">No spending this month yet.</p>
          )}
        </Card>
        </div>

        {/* Penny score (ml/model.py): how much of your spending mix matches the 20 people most like you (KNN) */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="glass flex flex-col rounded-3xl border border-line p-6 shadow-card sm:p-7"
        >
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">Your Penny score</p>
          <ScoreRing score={insights.score} />
          <p className="mt-2 text-center text-pretty text-ink">{scoreLine(insights.score)}</p>
          <p className="mt-auto border-t border-line pt-4 text-center text-sm text-ink-2">
            999 = you spend just like them ·{' '}
            <button type="button" onClick={() => onNavigate('compare')} className="font-medium whitespace-nowrap text-brand">
              Compare →
            </button>
          </p>
        </motion.section>
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

/** One friendly line about the Penny score (how much of your spending mix matches people like you). */
function scoreLine(score: number): string {
  if (score >= 850) return 'You spend a lot like people like you.'
  if (score >= 650) return 'Mostly in line, with one or two categories that stand out.'
  return 'A few categories stand out. That’s where your savings are.'
}
