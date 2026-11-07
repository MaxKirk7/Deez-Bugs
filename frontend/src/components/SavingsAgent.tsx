import { ArrowRight, Bot, Check, Globe, LoaderCircle, Scale, Search, Sparkles, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { researchSavings } from '../api'
import { CATEGORY } from '../lib/categories'
import { gbp } from '../lib/format'
import type { AgentResult, AgentStep, SavingsOpportunity } from '../types'
import { Badge, Card, CardHeader, IconTile } from './ui'

type Run = { status: 'idle' } | { status: 'running'; steps: AgentStep[] } | { status: 'done'; steps: AgentStep[]; result: AgentResult } | { status: 'error'; message: string }

const STEP_ICON: Record<AgentStep['kind'], LucideIcon> = { search: Search, visit: Globe, compare: Scale, done: Check }

/** Savings ideas + the browser agent that researches cheaper options live. */
export function SavingsAgent({ savings }: { savings: SavingsOpportunity[] }) {
  const [runs, setRuns] = useState<Record<string, Run>>({})

  const start = async (id: string) => {
    setRuns((r) => ({ ...r, [id]: { status: 'running', steps: [] } }))
    try {
      const result = await researchSavings(id, (step) =>
        setRuns((r) => {
          const cur = r[id]
          return cur?.status === 'running' ? { ...r, [id]: { status: 'running', steps: [...cur.steps, step] } } : r
        }),
      )
      setRuns((r) => {
        const cur = r[id]
        const steps = cur && 'steps' in cur ? cur.steps : []
        return { ...r, [id]: { status: 'done', steps, result } }
      })
    } catch (e) {
      setRuns((r) => ({ ...r, [id]: { status: 'error', message: e instanceof Error ? e.message : 'Something went wrong' } }))
    }
  }

  const idle = savings.filter((s) => (runs[s.id]?.status ?? 'idle') === 'idle')
  const found = Object.values(runs).reduce((s, r) => s + (r.status === 'done' ? r.result.monthly_saving : 0), 0)

  return (
    <Card delay={0.25}>
      <CardHeader
        icon={Bot}
        title="Savings agent"
        subtitle="Our AI agent browses real shop and provider websites to find you cheaper options"
        action={
          idle.length > 0 ? (
            <button
              type="button"
              onClick={() => idle.forEach((s) => start(s.id))}
              className="hidden shrink-0 items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand/25 transition-transform hover:-translate-y-0.5 sm:inline-flex"
            >
              <Sparkles className="size-4" aria-hidden /> Research all
            </button>
          ) : found > 0 ? (
            <Badge tone="good" icon={Check}>
              {gbp(found, 0)}/mo found
            </Badge>
          ) : null
        }
      />
      <div className="grid items-start gap-3 p-5 sm:p-6 lg:grid-cols-3">
        {savings.map((s) => (
          <Opportunity key={s.id} opp={s} run={runs[s.id] ?? { status: 'idle' }} onStart={() => start(s.id)} />
        ))}
      </div>
    </Card>
  )
}

function Opportunity({ opp, run, onStart }: { opp: SavingsOpportunity; run: Run; onStart: () => void }) {
  const meta = CATEGORY[opp.category]
  return (
    <motion.article layout className="rounded-2xl border border-line bg-bg/40 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <IconTile icon={meta.icon} />
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{meta.label}</p>
          <h3 className="mt-0.5 text-[15px] font-semibold tracking-tight text-ink">{opp.title}</h3>
        </div>
      </div>
      <p className="mt-3 text-sm text-pretty text-ink-2">{opp.summary}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Potential saving</p>
          <p className="tabular text-lg font-semibold text-good-text">
            {gbp(opp.save_min, 0)}–{gbp(opp.save_max, 0)}
            <span className="text-sm font-medium">/mo</span>
          </p>
        </div>
        <p className="tabular text-right text-xs text-muted">
          You spend
          <br />
          <span className="text-sm font-medium text-ink-2">{gbp(opp.current_monthly, 0)}/mo</span>
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {run.status === 'idle' && (
          <motion.button
            key="idle"
            type="button"
            onClick={onStart}
            exit={{ opacity: 0 }}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-brand/50 hover:text-brand"
          >
            <Bot className="size-4" aria-hidden /> Find cheaper options
          </motion.button>
        )}
        {(run.status === 'running' || run.status === 'done') && (
          <motion.div key="log" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="overflow-hidden">
            <AgentLog steps={run.steps} running={run.status === 'running'} />
            {run.status === 'done' && <Result result={run.result} />}
          </motion.div>
        )}
        {run.status === 'error' && (
          <motion.p key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-sm text-critical-text">
            {run.message}.{' '}
            <button type="button" onClick={onStart} className="font-medium underline">
              Try again
            </button>
          </motion.p>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

function AgentLog({ steps, running }: { steps: AgentStep[]; running: boolean }) {
  const [open, setOpen] = useState(true)
  const shown = running || open ? steps : []
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={running}
        className="flex w-full items-center gap-2 text-xs font-medium text-ink-2"
      >
        {running ? (
          <LoaderCircle className="size-3.5 animate-spin text-brand" aria-hidden />
        ) : (
          <Check className="size-3.5 text-good-text" aria-hidden />
        )}
        {running ? 'Agent is browsing…' : `Agent finished · ${steps.length} steps`}
        {!running && <span className="ml-auto text-muted">{open ? 'Hide' : 'Show'}</span>}
      </button>
      <ol className="space-y-1.5" aria-live="polite">
        <AnimatePresence initial={false}>
          {shown.map((step, i) => {
            const Icon = STEP_ICON[step.kind]
            const latest = running && i === steps.length - 1
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-start gap-2 pt-1.5 text-xs first:mt-2 ${latest ? 'text-ink' : 'text-muted'}`}
              >
                <Icon className={`mt-px size-3.5 shrink-0 ${latest ? 'text-brand' : ''}`} aria-hidden />
                <span className="min-w-0">
                  {step.text}
                  {step.url && (
                    <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-px font-mono text-[11px] text-ink-2">{step.url}</span>
                  )}
                </span>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ol>
    </div>
  )
}

function Result({ result }: { result: AgentResult }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-3">
      <p className="text-sm font-semibold text-ink">{result.headline}</p>
      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
        <li className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-muted">{result.current.name}</span>
          <span className="tabular text-muted line-through">{gbp(result.current.price)}</span>
        </li>
        {result.alternatives.map((alt) => (
          <li key={alt.name} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{alt.name}</span>
              <span className="block truncate text-xs text-muted">{alt.note}</span>
            </span>
            <span className="tabular shrink-0 text-right">
              <span className="block font-semibold text-ink">{gbp(alt.price)}</span>
              <span className="block text-xs font-medium text-good-text">−{gbp(result.current.price - alt.price)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-good-soft px-3 py-1 text-sm font-semibold text-good-text">
        <ArrowRight className="size-3.5" aria-hidden /> About {gbp(result.monthly_saving, 0)} a month saved
      </p>
    </motion.div>
  )
}
