import { Check, LoaderCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Logo } from './UploadScreen'

/** The steps mirror the real pipeline: upload → Tiger → spending mix → k-means → KNN → compare. */
const STEPS = [
  'Reading your transactions',
  'Saving them to Tiger Data',
  'Working out your spending mix',
  'Placing you in a group (k-means)',
  'Finding your 20 most similar people (KNN)',
  'Comparing you with them',
]
const STEP_MS = 520

/** Shows each step ticking off, then calls onDone once the animation AND the data are ready. */
export function ProcessingScreen({ live, ready, onDone }: { live: boolean; ready: boolean; onDone: () => void }) {
  const [done, setDone] = useState(0)

  useEffect(() => {
    if (done < STEPS.length) {
      const t = setTimeout(() => setDone((d) => d + 1), STEP_MS)
      return () => clearTimeout(t)
    }
    if (ready) {
      const t = setTimeout(onDone, 350)
      return () => clearTimeout(t)
    }
  }, [done, ready, onDone])

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md glass rounded-3xl border border-line p-7 shadow-card"
      >
        <Logo />
        <h1 className="mt-6 text-xl font-semibold tracking-tight text-ink">Analysing your statement…</h1>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full rounded-full bg-brand"
            animate={{ width: `${(done / STEPS.length) * 100}%` }}
            transition={{ ease: 'easeOut', duration: 0.4 }}
          />
        </div>
        <ul className="mt-6 space-y-3" aria-live="polite">
          {STEPS.map((step, i) => {
            const state = i < done ? 'done' : i === done ? 'active' : 'todo'
            return (
              <li key={step} className="flex items-center gap-3 text-sm">
                <span
                  className={`grid size-6 place-items-center rounded-full transition-colors ${
                    state === 'done' ? 'bg-brand text-white' : state === 'active' ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-muted'
                  }`}
                >
                  {state === 'done' ? (
                    <Check className="size-3.5" strokeWidth={3} aria-hidden />
                  ) : state === 'active' ? (
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className={state === 'todo' ? 'text-muted' : 'text-ink'}>{step}</span>
              </li>
            )
          })}
        </ul>
        {done >= STEPS.length && !ready && (
          <p className="mt-5 text-xs text-muted">
            {live ? 'The model is warming up. The first run can take up to a minute.' : 'Almost there…'}
          </p>
        )}
      </motion.div>
    </div>
  )
}
