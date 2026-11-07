import { Brain, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { CATEGORY } from '../lib/categories'
import { pct } from '../lib/format'
import type { CategoryShare, Dashboard } from '../types'
import { Card, CardHeader, SourceTag } from './ui'

/**
 * "Guess your mix": guess what % of your money goes on your top 3 categories,
 * then reveal the real numbers, then your whole mix vs people like you.
 * Real numbers come from the model's `categories` (your_share / neighbours_share).
 */
export function MixQuiz({ data }: { data: Dashboard }) {
  const cats = data.insights.categories
  const top3 = [...cats].sort((a, b) => b.your_share - a.your_share).slice(0, 3)
  const [guesses, setGuesses] = useState(() => top3.map(() => 15))
  const [revealed, setRevealed] = useState(false)

  const close = top3.filter((c, i) => Math.abs(c.your_share * 100 - guesses[i]) <= 5).length

  return (
    <Card delay={0.1} className="flex h-full flex-col">
      <CardHeader
        icon={Brain}
        title="Guess your mix"
        subtitle={revealed ? 'Here’s how you did' : 'What % of your money goes on each? Drag, then reveal.'}
        action={<SourceTag kind={data.mode === 'live' ? 'live' : 'placeholder'} />}
      />

      <div className="flex flex-1 flex-col px-5 pt-5 pb-5 sm:px-6">
        <ul className="space-y-5">
          {top3.map((c, i) => (
            <QuizRow
              key={c.category}
              cat={c}
              guess={guesses[i]}
              revealed={revealed}
              onGuess={(v) => setGuesses((g) => g.map((x, j) => (j === i ? v : x)))}
            />
          ))}
        </ul>

        <AnimatePresence mode="wait" initial={false}>
          {revealed ? (
            <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{close}/3</span> within 5 points.{' '}
                  <span className="text-ink-2">{close === 3 ? 'You really know your spending.' : close === 0 ? 'Most people guess wrong too.' : 'Not bad.'}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setRevealed(false)}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink"
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Again
                </button>
              </div>
              <MixBars cats={cats} />
            </motion.div>
          ) : (
            <motion.button
              key="reveal"
              type="button"
              exit={{ opacity: 0 }}
              onClick={() => setRevealed(true)}
              className="mt-auto w-full rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-surface-solid transition-transform hover:-translate-y-0.5"
            >
              Reveal my real numbers
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </Card>
  )
}

function QuizRow({
  cat,
  guess,
  revealed,
  onGuess,
}: {
  cat: CategoryShare
  guess: number
  revealed: boolean
  onGuess: (v: number) => void
}) {
  const meta = CATEGORY[cat.category]
  const real = Math.round(cat.your_share * 100)
  const off = guess - real
  const MAX = 60
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <meta.icon className="size-4 text-muted" aria-hidden /> {meta.label}
        </p>
        <p className="tabular text-sm text-ink-2">
          {revealed ? (
            <>
              you said {guess}% · <span className="font-semibold text-ink">really {real}%</span>
            </>
          ) : (
            <span className="font-semibold text-ink">{guess}%</span>
          )}
        </p>
      </div>
      <div className="relative mt-2.5">
        <input
          type="range"
          min={0}
          max={MAX}
          value={guess}
          disabled={revealed}
          onChange={(e) => onGuess(Number(e.target.value))}
          aria-label={`Your guess for ${meta.label}`}
          aria-valuetext={`${guess}%`}
          className="slider w-full disabled:cursor-default disabled:opacity-60"
          style={{ ['--fill' as string]: `${(guess / MAX) * 100}%` }}
        />
        {revealed && (
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet shadow-[0_0_12px_var(--violet)] ring-2 ring-surface-solid"
            style={{ left: `${(Math.min(real, MAX) / MAX) * 100}%` }}
            aria-hidden
          />
        )}
      </div>
      {revealed && (
        <p className="mt-1.5 text-xs text-muted">
          {Math.abs(off) <= 5 ? '✓ Spot on' : off > 0 ? `You guessed ${off} points too high` : `You guessed ${-off} points too low`}
        </p>
      )}
    </li>
  )
}

/** Your whole mix vs your 20 nearest neighbours. Hover a row for the numbers. */
function MixBars({ cats }: { cats: CategoryShare[] }) {
  const rows = [...cats].sort((a, b) => b.your_share - a.your_share).slice(0, 7)
  const max = Math.max(...rows.flatMap((r) => [r.your_share, r.neighbours_share]))
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-2">Your whole mix</p>
        <ul className="flex gap-3 text-[11px] text-muted">
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand" /> You
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-compare" /> People like you
          </li>
        </ul>
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map((r, i) => (
          <li
            key={r.category}
            className="group grid grid-cols-[110px_1fr_40px] items-center gap-3 rounded-lg px-1 py-1 hover:bg-surface-2"
            title={`${r.label}: you ${pct(r.your_share)}, people like you ${pct(r.neighbours_share)}`}
          >
            <span className="truncate text-xs text-ink-2">{r.label}</span>
            <span className="space-y-[2px]">
              <motion.span
                className="block h-1.5 rounded-full bg-brand"
                initial={{ width: 0 }}
                animate={{ width: `${(r.your_share / max) * 100}%` }}
                transition={{ delay: 0.1 + i * 0.04, duration: 0.7 }}
              />
              <motion.span
                className="block h-1.5 rounded-full bg-compare"
                initial={{ width: 0 }}
                animate={{ width: `${(r.neighbours_share / max) * 100}%` }}
                transition={{ delay: 0.15 + i * 0.04, duration: 0.7 }}
              />
            </span>
            <span className="tabular text-right text-xs font-medium text-ink">{pct(r.your_share)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
