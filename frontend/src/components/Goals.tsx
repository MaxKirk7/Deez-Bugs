import { CircleCheck, Flag, Target, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { CATEGORY } from '../lib/categories'
import { money, pct, shortDate } from '../lib/format'
import type { Category, Currency, Dashboard, Recommendation } from '../types'
import { Card, CardHeader, SourceTag } from './ui'

/** A goal is saved in this browser and checked against the NEXT statement you upload. */
interface Goal {
  category: Category
  label: string
  start: number // your share when you set it
  target: number // what people like you spend
  saving: number // per month
  currency: Currency
  filename: string // statement it was set on
  set_on: string
}
const KEY = 'penny-goal'

function loadGoal(): Goal | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Goal) : null
  } catch {
    return null
  }
}
function saveGoal(g: Goal | null) {
  try {
    if (g) localStorage.setItem(KEY, JSON.stringify(g))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage blocked: the goal still works until the page reloads */
  }
}

/**
 * "So what do I do?": the model's recommendations, and one goal you commit to.
 * Upload next month's statement and the goal card shows if you moved towards it.
 */
export function Goals({ data }: { data: Dashboard }) {
  const { recommendations, categories } = data.insights
  const [goal, setGoal] = useState<Goal | null>(loadGoal)

  const pick = (r: Recommendation) => {
    const g: Goal = {
      category: r.category,
      label: r.label,
      start: r.your_share,
      target: r.neighbours_share,
      saving: r.est_monthly_saving,
      currency: data.currency,
      filename: data.filename,
      set_on: new Date().toISOString().slice(0, 10),
    }
    saveGoal(g)
    setGoal(g)
  }
  const clear = () => {
    saveGoal(null)
    setGoal(null)
  }

  return (
    <Card delay={0.25}>
      <CardHeader
        icon={Target}
        title="Pick one thing to change"
        subtitle="Where you spend more than people like you. Choose one goal, then check it next month."
        action={<SourceTag kind={data.mode === 'live' ? 'live' : 'placeholder'} />}
      />

      <div className="px-5 pt-5 pb-6 sm:px-6">
        {goal && <GoalProgress goal={goal} now={categories.find((c) => c.category === goal.category)?.your_share ?? 0} sameStatement={goal.filename === data.filename} onClear={clear} />}

        {recommendations.length === 0 ? (
          <p className="flex items-center gap-2 rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">
            <CircleCheck className="size-4 text-good-text" aria-hidden /> Your mix is in line with people like you. Nothing to fix.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {recommendations.map((r, i) => {
              const meta = CATEGORY[r.category]
              const chosen = goal?.category === r.category
              return (
                <motion.li
                  key={r.category}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                  className={`flex flex-col rounded-2xl border p-4 transition-colors ${chosen ? 'border-brand bg-brand-soft' : 'border-line'}`}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <meta.icon className="size-4 text-brand" aria-hidden /> {r.label}
                  </p>
                  <p className="mt-3 text-sm text-ink-2">
                    <span className="font-semibold text-ink">{pct(r.your_share)}</span> of your money · people like you{' '}
                    {pct(r.neighbours_share)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Matching them frees up about{' '}
                    <span className="font-medium text-good-text">{money(r.est_monthly_saving, data.currency)}/month</span>, or{' '}
                    {money(r.est_monthly_saving * 12, data.currency)} a year
                  </p>
                  <button
                    type="button"
                    onClick={() => pick(r)}
                    disabled={chosen}
                    className={`mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      chosen ? 'text-brand' : 'border border-line text-ink hover:border-brand/60 hover:text-brand'
                    }`}
                  >
                    {chosen ? (
                      <>
                        <CircleCheck className="size-4" aria-hidden /> Your goal
                      </>
                    ) : (
                      <>
                        <Flag className="size-4" aria-hidden /> Make this my goal
                      </>
                    )}
                  </button>
                </motion.li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}

function GoalProgress({ goal, now, sameStatement, onClear }: { goal: Goal; now: number; sameStatement: boolean; onClear: () => void }) {
  const gap = goal.start - goal.target
  const progress = gap > 0 ? Math.max(0, Math.min(1, (goal.start - now) / gap)) : 1
  const hit = now <= goal.target
  return (
    <div className="mb-5 rounded-2xl border border-line bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">Your goal · set {shortDate(goal.set_on)}</p>
          <p className="mt-1 text-[15px] font-semibold text-ink">
            {goal.label}: {pct(goal.start)} → {pct(goal.target)} of your spending
          </p>
        </div>
        <button type="button" onClick={onClear} aria-label="Remove goal" className="rounded-full p-1 text-muted hover:text-ink">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-brand to-violet"
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.8 }}
        />
      </div>
      <p className="mt-2 text-xs text-ink-2">
        {sameStatement
          ? `Set on this statement. Upload next month’s to see if you hit it, worth about ${money(goal.saving, goal.currency)} a month.`
          : hit
            ? `✓ Done: ${goal.label} is now ${pct(now)} of your spending.`
            : `This statement: ${pct(now)}. ${Math.round(progress * 100)}% of the way there.`}
      </p>
    </div>
  )
}
