import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { answerUnusual } from '../api'
import { forecastFromRows } from '../lib/forecast'
import { PAGES, usePage, type PageId } from '../lib/pages'
import type { Theme } from '../lib/useTheme'
import type { Dashboard as DashboardData, UnusualRow } from '../types'
import { AssistantScreen } from './AssistantScreen'
import { ForecastChart } from './ForecastChart'
import { Goals } from './Goals'
import { Heatmap } from './Heatmap'
import { Hero } from './Hero'
import { MixQuiz } from './MixQuiz'
import { Overview } from './Overview'
import { Preview } from './Preview'
import { AssistantFloatingButton, TopBar } from './TopBar'
import { UnusualTransactions } from './UnusualTransactions'
import { Card } from './ui'

/**
 * The dashboard, split into pages (top nav; each page has its own #/address):
 *   Home             biggest win + what-if, score, map, explore tiles
 *   Fraud check      "Was this you?" unusual purchases                     (real model)
 *   Compare          score + group, guess your mix vs people like you      (real model)
 *   Recommendations  pick one thing to change + coming next (agent, subs)  (real model · placeholder)
 *   Forecast         where this month is heading + the spending calendar  (real statement)
 */
export function Dashboard({
  data,
  theme,
  onToggleTheme,
  onReset,
  assistantOpen,
  onOpenAssistant,
  onChange,
  onCloseAssistant,
  muted,
  onToggleMute,
}: {
  data: DashboardData
  theme: Theme
  onToggleTheme: () => void
  onReset: () => void
  assistantOpen: boolean
  onOpenAssistant: () => void
  onChange: (data: DashboardData) => void
  onCloseAssistant: () => void
  muted: boolean
  onToggleMute: () => void
}) {
  const [page, go] = usePage()
  // "Was this you?" answered: show the updated score, map, calendar...
  const onAnswer = async (row: UnusualRow, wasMe: boolean) => onChange(await answerUnusual(data, row, wasMe))
  // Real forecast from the statement (updates when a "Not me" purchase is removed)
  const forecast = useMemo(() => forecastFromRows(data.rows), [data.rows])

  const pages: Record<PageId, ReactNode> = {
    home: <Overview data={data} forecast={forecast} onNavigate={go} />,
    unusual: (
      <>
        <PageHeader title="Fraud check" subtitle="Anything that doesn’t look like you, by price, time and place." />
        <UnusualTransactions data={data} onAnswer={onAnswer} />
        <p className="flex items-start gap-2 px-1 text-sm text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          Trained on 908 real card holders and 4,075 known fraud purchases: 98–99% of what it flags is real fraud.
        </p>
      </>
    ),
    compare: (
      <>
        <Hero data={data} />
        <MixQuiz data={data} />
      </>
    ),
    recommendations: (
      <>
        <PageHeader title="Recommendations" subtitle="Pick one thing to change." />
        <Goals data={data} />
        <div className="pt-6">
          <Preview data={data.preview} />
        </div>
      </>
    ),
    forecast: (
      <>
        <PageHeader title="Forecast" subtitle="Where this month is heading, and the days your money goes." />
        {forecast ? (
          <ForecastChart forecast={forecast.forecast} month={forecast.month} theme={theme} currency={data.currency} />
        ) : (
          <Card className="p-6 text-sm text-ink-2">Not enough purchases in this statement to forecast yet.</Card>
        )}
        <Heatmap data={data} />
      </>
    ),
  }
  const next = PAGES[(PAGES.findIndex((p) => p.id === page) + 1) % PAGES.length]

  return (
    <div className="min-h-dvh">
      <TopBar data={data} theme={theme} onToggleTheme={onToggleTheme} onReset={onReset} page={page} onNavigate={go} onAskPenny={onOpenAssistant} />
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6" onClick={assistantOpen ? onCloseAssistant : undefined}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-5"
          >
            {pages[page]}
            {page !== 'home' && (
              <button
                type="button"
                onClick={() => go(next.id)}
                className="glass group mt-4 flex w-full items-center justify-between rounded-3xl border border-line px-6 py-5 text-left transition-colors hover:border-brand/50"
              >
                <span>
                  <span className="block text-xs font-semibold tracking-widest text-muted uppercase">Next</span>
                  <span className="text-lg font-semibold text-ink">{next.label}</span>
                </span>
                <ArrowRight className="size-5 text-brand transition-transform group-hover:translate-x-1" aria-hidden />
              </button>
            )}
          </motion.div>
        </AnimatePresence>
        <footer className="pt-12 text-center text-xs text-muted">Penny · Deez-Bugs · HackTheBurgh 2026</footer>
      </main>
      <AssistantFloatingButton onClick={onOpenAssistant} active={assistantOpen} />
      {assistantOpen && <AssistantScreen data={data} muted={muted} onToggleMute={onToggleMute} onClose={onCloseAssistant} />}
    </div>
  )
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="pt-8 pb-1 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-ink-2">{subtitle}</p>
    </header>
  )
}
