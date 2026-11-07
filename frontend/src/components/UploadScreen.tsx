import { ArrowRight, Brain, CalendarDays, Lock, Network, PiggyBank, Sparkles, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { useRef, useState, type DragEvent } from 'react'

const FEATURES = [
  { icon: Network, title: 'Finds people like you', body: 'Matched with 908 real spenders by our model' },
  { icon: Brain, title: 'Tests what you know', body: 'Guess your spending, then see the truth' },
  { icon: CalendarDays, title: 'Shows your habits', body: 'A calendar of every day you spent' },
]

export function UploadScreen({ live, onFile }: { live: boolean | null; onFile: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      {/* soft brand glow behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]"
        style={{ background: 'radial-gradient(60% 60% at 50% 0%, var(--glow), transparent 70%)' }}
      />

      <header className="flex items-center gap-2.5 py-6">
        <Logo />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center pb-16 pt-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 inline-flex items-center gap-2 glass rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-2"
        >
          <Sparkles className="size-3.5 text-brand" aria-hidden /> Built for students
          <span className="h-3 w-px bg-line" aria-hidden />
          {live === null ? (
            'Checking the model…'
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${live ? 'bg-good' : 'bg-warning'}`} aria-hidden />
              {live ? 'Live model connected' : 'Backend offline: demo mode'}
            </span>
          )}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-ink sm:text-6xl"
        >
          Know your money. <span className="bg-gradient-to-r from-brand to-violet bg-clip-text text-transparent">Change one thing.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-5 max-w-xl text-base text-pretty text-ink-2 sm:text-lg"
        >
          Upload your statement. Penny compares you with people who spend like you, and helps you pick one change that matters.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="mt-10 w-full max-w-xl"
        >
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`group flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition-all ${
              dragging
                ? 'scale-[1.01] border-brand bg-brand-soft'
                : 'glass border-line shadow-card hover:border-brand/50'
            }`}
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/25 transition-transform group-hover:-translate-y-0.5">
              <Upload className="size-5" aria-hidden />
            </span>
            <span className="text-base font-semibold text-ink">Drop your bank statement here</span>
            <span className="text-sm text-muted">
              CSV with columns <span className="font-mono text-xs">trans_date_trans_time, merchant, category, amt</span> · or{' '}
              <span className="font-medium text-brand underline-offset-2 group-hover:underline">browse files</span>
            </span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />

          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>

          <button
            type="button"
            onClick={() => onFile(null)}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-surface-solid transition-transform hover:-translate-y-0.5"
          >
            Try it with Alex, a demo student <ArrowRight className="size-4" aria-hidden />
          </button>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted">
            <Lock className="size-3.5" aria-hidden />
            {live ? 'Your statement is saved to our database so the model can compare you.' : 'Demo mode: nothing leaves your browser.'}
          </p>
        </motion.div>

        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-14 grid w-full max-w-3xl gap-3 sm:grid-cols-3"
        >
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="glass rounded-2xl border border-line p-4 text-left">
              <Icon className="size-5 text-brand" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-sm text-muted">{body}</p>
            </li>
          ))}
        </motion.ul>
      </main>
    </div>
  )
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] bg-brand text-white shadow-md shadow-brand/30">
        <PiggyBank className="size-[18px]" aria-hidden />
      </span>
      <span className="text-lg font-semibold tracking-tight text-ink">Penny</span>
    </span>
  )
}
