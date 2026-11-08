import { motion } from 'motion/react'
import { groupName, money, pct } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'
import type { Dashboard } from '../types'
import { SourceTag } from './ui'

/** The top of the page: one sentence, one number. Everything here comes from the model. */
export function Hero({ data }: { data: Dashboard }) {
  const { insights, user, mode, currency } = data
  const top = insights.categories[0] // biggest gap vs people like you (the backend sorts them)
  const above = top && top.your_share > top.neighbours_share

  return (
    <section className="grid items-center gap-8 pt-10 pb-4 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_auto]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">Hi {user.name} 👋</p>
          <SourceTag kind={mode === 'live' ? 'live' : 'placeholder'}>
            {mode === 'live' ? 'Live model output' : 'Placeholder model output · backend offline'}
          </SourceTag>
        </div>
        <h1 className="mt-4 max-w-3xl text-3xl leading-[1.15] font-semibold tracking-tight text-balance text-ink sm:text-5xl">
          You spend like the{' '}
          <span className="bg-gradient-to-r from-brand to-violet bg-clip-text text-transparent">{groupName(insights.segment.name)}</span>{' '}
          crowd.
        </h1>
        {above && (
          <p className="mt-4 max-w-2xl text-base text-pretty text-ink-2 sm:text-lg">
            Biggest difference: <span className="font-medium text-ink">{top.label}</span> takes {pct(top.your_share)} of your
            money. People like you spend {pct(top.neighbours_share)}.
          </p>
        )}
        <p className="mt-6 text-xs text-muted">
          From {data.rows.length} payments in <span className="font-mono">{data.filename}</span> · about{' '}
          {money(insights.monthly_spend, currency)} a month · compared with {insights.neighbours.length} similar people out of 908
        </p>
      </motion.div>

      <ScoreRing score={insights.score} />
    </section>
  )
}

/** The model's score, out of 999 like a credit score, as a glowing ring. */
export const SCORE_MAX = 999
export function ScoreRing({ score }: { score: number }) {
  const shown = useCountUp(score)
  const r = 70
  const c = 2 * Math.PI * r
  return (
    <motion.figure
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.1 }}
      className="mx-auto flex flex-col items-center"
    >
      <div className="relative size-48">
        <div className="absolute inset-6 rounded-full bg-brand/25 blur-2xl" aria-hidden />
        <svg viewBox="0 0 180 180" className="relative size-full -rotate-90" role="img" aria-label={`Score ${score} out of ${SCORE_MAX}`}>
          <defs>
            <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--brand)" />
              <stop offset="100%" stopColor="var(--violet)" />
            </linearGradient>
          </defs>
          <circle cx="90" cy="90" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
          <motion.circle
            cx="90"
            cy="90"
            r={r}
            fill="none"
            stroke="url(#ring)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - score / SCORE_MAX) }}
            transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="tabular text-5xl font-semibold tracking-tight text-ink">{Math.round(shown)}</p>
            <p className="text-xs text-muted">out of {SCORE_MAX}</p>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 max-w-48 text-center text-sm text-ink-2">
        How closely your spending matches people like you
      </figcaption>
    </motion.figure>
  )
}
