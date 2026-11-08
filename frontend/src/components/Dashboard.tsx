import type { Theme } from '../lib/useTheme'
import type { Dashboard as DashboardData } from '../types'
import { Goals } from './Goals'
import { Heatmap } from './Heatmap'
import { Hero } from './Hero'
import { MixQuiz } from './MixQuiz'
import { NewFeatureSlot } from './NewFeatureSlot'
import { Preview } from './Preview'
import { AssistantScreen } from './AssistantScreen'
import { AssistantFloatingButton, TopBar } from './TopBar'

/**
 * Page, top to bottom:
 *  1. Hero            one sentence + the model's score            (real model)
 *  2. Quiz | Slot     guess your mix · NEW FEATURE (empty for now) (real model)
 *  3. Heatmap         spending calendar                           (real statement)
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
  onCloseAssistant: () => void
  muted: boolean
  onToggleMute: () => void
}) {
  return (
    <div className="min-h-dvh">
      <TopBar
        data={data}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReset={onReset}
      />
      <main className="mx-auto max-w-6xl space-y-5 px-4 pb-20 sm:px-6">
        <Hero data={data} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <MixQuiz data={data} />
          <NewFeatureSlot data={data} />
        </div>
        <Heatmap data={data} />
        <Goals data={data} />
        <div className="pt-10">
          <Preview data={data.preview} theme={theme} />
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
