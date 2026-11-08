import { answerUnusual } from '../api'
import type { Theme } from '../lib/useTheme'
import type { Dashboard as DashboardData, UnusualRow } from '../types'
import { Goals } from './Goals'
import { Heatmap } from './Heatmap'
import { Hero } from './Hero'
import { MixQuiz } from './MixQuiz'
import { Preview } from './Preview'
import { SpendingMap } from './SpendingMap'
import { TopBar } from './TopBar'
import { UnusualTransactions } from './UnusualTransactions'

/**
 * Page, top to bottom:
 *  1. Hero            one sentence + the model's score            (real model)
 *     Unusual         "Was this you?" purchases to check          (real model)
 *  2. Quiz | Map      guess your mix · where you spend (map)     (real model · real locations)
 *  3. Heatmap         spending calendar                           (real statement)
 *  4. Goals           pick one thing to change                    (real model)
 *  5. Coming next     forecast, subscriptions, agent              (PLACEHOLDER)
 */
export function Dashboard({
  data,
  theme,
  onToggleTheme,
  onReset,
  onOpenAssistant,
  onChange,
}: {
  data: DashboardData
  theme: Theme
  onToggleTheme: () => void
  onReset: () => void
  onOpenAssistant: () => void
  onChange: (data: DashboardData) => void
}) {
  // "Was this you?" answered: show the updated score, map, calendar...
  const onAnswer = async (row: UnusualRow, wasMe: boolean) => onChange(await answerUnusual(data, row, wasMe))

  return (
    <div className="min-h-dvh">
      <TopBar
        data={data}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReset={onReset}
        onOpenAssistant={onOpenAssistant}
        assistantActive={false}
      />
      <main className="mx-auto max-w-6xl space-y-5 px-4 pb-20 sm:px-6">
        <Hero data={data} />
        <UnusualTransactions data={data} onAnswer={onAnswer} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <MixQuiz data={data} />
          <SpendingMap data={data} />
        </div>
        <Heatmap data={data} />
        <Goals data={data} />
        <div className="pt-10">
          <Preview data={data.preview} theme={theme} />
        </div>
        <footer className="pt-10 text-center text-xs text-muted">Penny · Deez-Bugs · HackTheBurgh 2026</footer>
      </main>
    </div>
  )
}
