import { answerUnusual } from '../api'
import type { Theme } from '../lib/useTheme'
import type { Dashboard as DashboardData, UnusualRow } from '../types'
import { useMemo } from 'react'
import { forecastFromRows } from '../lib/forecast'
import { ForecastChart } from './ForecastChart'
import { Goals } from './Goals'
import { Heatmap } from './Heatmap'
import { Hero } from './Hero'
import { MixQuiz } from './MixQuiz'
import { SpendingMap } from './SpendingMap'
import { Preview } from './Preview'
import { AssistantScreen } from './AssistantScreen'
import { AssistantFloatingButton, TopBar } from './TopBar'
import { UnusualTransactions } from './UnusualTransactions'

/**
 * Page, top to bottom:
 *  1. Hero            one sentence + the model's score            (real model)
 *     Unusual         "Was this you?" purchases to check          (real model)
 *  2. Quiz | Map      guess your mix · where you spend (map)     (real model · real locations)
 *  3. Heatmap         spending calendar                           (real statement)
 *     Forecast        where this month is heading                 (real statement: lib/forecast.ts)
 *  4. Goals           pick one thing to change                    (real model)
 *  5. Coming next     forecast, subscriptions, agent              (PLACEHOLDER)
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
  // "Was this you?" answered: show the updated score, map, calendar...
  const onAnswer = async (row: UnusualRow, wasMe: boolean) => onChange(await answerUnusual(data, row, wasMe))

  // Real forecast from the statement (updates when a "Not me" purchase is removed)
  const forecast = useMemo(() => forecastFromRows(data.rows), [data.rows])

  return (
    <div className="min-h-dvh">
      <TopBar
        data={data}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReset={onReset}
      />
      <main
        className="mx-auto max-w-6xl space-y-5 px-4 pb-20 sm:px-6"
        onClick={assistantOpen ? onCloseAssistant : undefined}
      >
        <Hero data={data} />
        <UnusualTransactions data={data} onAnswer={onAnswer} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <MixQuiz data={data} />
          <SpendingMap data={data} />
        </div>
        <Heatmap data={data} />
        {forecast && <ForecastChart forecast={forecast.forecast} month={forecast.month} theme={theme} currency={data.currency} />}
        <Goals data={data} />
        <div className="pt-10">
          <Preview data={data.preview} />
        </div>
        <footer className="pt-10 text-center text-xs text-muted">Penny · Deez-Bugs · HackTheBurgh 2026</footer>
      </main>
      <AssistantFloatingButton onClick={onOpenAssistant} active={assistantOpen} />
      {assistantOpen && (
        <AssistantScreen
          data={data}
          muted={muted}
          onToggleMute={onToggleMute}
          onClose={onCloseAssistant}
        />
      )}
    </div>
  )
}
