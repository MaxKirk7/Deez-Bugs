import { Users } from 'lucide-react'
import { motion } from 'motion/react'
import { CATEGORY } from '../lib/categories'
import { groupName, pct } from '../lib/format'
import type { Dashboard } from '../types'
import { Card, SourceTag } from './ui'

const SHOW = 6

/**
 * PEOPLE LIKE YOU: your spending mix next to your 20 most similar people (KNN, ml/model.py).
 * Two bars per category: you vs them. The biggest gaps (you spend more) are highlighted.
 */
export function PeopleLikeYou({ data }: { data: Dashboard }) {
  const { insights, mode } = data
  // Your top categories by share of your money
  const rows = [...insights.categories].sort((a, b) => b.your_share - a.your_share).slice(0, SHOW)
  const max = Math.max(...rows.flatMap((r) => [r.your_share, r.neighbours_share]), 0.01)

  return (
    <div className="space-y-5">
      <header className="pt-8 pb-1 sm:pt-12">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">People like you</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Where your money goes, next to the {insights.neighbours.length} people (out of 908) who spend most like you.
        </p>
      </header>

      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-sm text-ink-2">
            <Users className="size-4 text-brand" aria-hidden />
            Your group: <b className="text-ink">{groupName(insights.segment.name)}</b> · {insights.segment.size} people
          </p>
          <div className="flex items-center gap-4 text-sm text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-brand" /> You
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-compare" /> People like you
            </span>
            <SourceTag kind={mode === 'live' ? 'live' : 'placeholder'} />
          </div>
        </div>

        <ul className="mt-6 space-y-5">
          {rows.map((r, i) => {
            const Icon = CATEGORY[r.category].icon
            const gap = r.your_share - r.neighbours_share
            const more = gap > 0.03 // the same 3-point gap the model uses for recommendations
            return (
              <li key={r.category} className={`rounded-2xl p-3 ${more ? 'bg-warning-soft' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <Icon className="size-4 text-muted" aria-hidden /> {CATEGORY[r.category].label}
                  </p>
                  <p className="text-sm text-ink-2">
                    {more ? (
                      <b className="text-warning-text">you spend {Math.round(gap * 100)} points more</b>
                    ) : gap < -0.03 ? (
                      <span>you spend less</span>
                    ) : (
                      <span>about the same</span>
                    )}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_44px] items-center gap-x-3 gap-y-1.5">
                  <Bar share={r.your_share} max={max} className="bg-brand" delay={i * 0.05} />
                  <span className="tabular text-right text-sm font-semibold text-ink">{pct(r.your_share)}</span>
                  <Bar share={r.neighbours_share} max={max} className="bg-compare" delay={i * 0.05 + 0.03} />
                  <span className="tabular text-right text-sm text-ink-2">{pct(r.neighbours_share)}</span>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-5 text-sm text-muted">
          % = share of your money in each category. Highlighted = where you spend 3+ points more than people like you: that’s where the
          savings on the Recommendations page come from.
        </p>
      </Card>
    </div>
  )
}

function Bar({ share, max, className, delay }: { share: number; max: number; className: string; delay: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-surface-2">
      <motion.div
        className={`h-full rounded-full ${className}`}
        initial={{ width: 0 }}
        animate={{ width: `${(share / max) * 100}%` }}
        transition={{ duration: 0.7, delay }}
      />
    </div>
  )
}
