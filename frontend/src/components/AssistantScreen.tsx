import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import type { Theme } from '../lib/useTheme'
import type { Dashboard as DashboardData } from '../types'
import { TopBar } from './TopBar'

const prompts = [
  'Explain my monthly habits',
  'Tell me my top worst spending habits',
  'How can I save more money?',
  'Find my recurring subscriptions',
  'Give me a spending summary',
]

export function AssistantScreen({
  data,
  theme,
  onToggleTheme,
  onReset,
  onOpenAssistant,
  muted,
  onToggleMute,
}: {
  data: DashboardData
  theme: Theme
  onToggleTheme: () => void
  onReset: () => void
  onOpenAssistant: () => void
  muted: boolean
  onToggleMute: () => void
}) {
  const [activePrompt, setActivePrompt] = useState<string | null>(null)
  const [askedPrompts, setAskedPrompts] = useState<Set<string>>(new Set())
  const [showSuggestions, setShowSuggestions] = useState(true)

  useEffect(() => {
    if (!activePrompt) return

    const timer = window.setTimeout(() => {
      setAskedPrompts((current) => new Set(current).add(activePrompt))
      setActivePrompt(null)
      setShowSuggestions(false)
    }, 100)

    return () => window.clearTimeout(timer)
  }, [activePrompt])

  const handlePromptClick = (prompt: string) => {
    setActivePrompt(prompt)
  }

  return (
    <div className="min-h-dvh">
      <TopBar
        data={data}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onReset={onReset}
        onOpenAssistant={onOpenAssistant}
        assistantActive
      />
      <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl flex-col items-center px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
        <img
          src="/ai-placeholder.svg"
          alt="AI assistant placeholder"
          className="size-36 rounded-[2rem] border border-line shadow-card"
        />
        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onToggleMute()}
            aria-label={muted ? 'Unmute assistant' : 'Mute assistant'}
            className="glass grid size-9 place-items-center rounded-full border border-line text-ink-2 transition-colors hover:border-brand hover:text-brand"
          >
            {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">What can I assist you with?</h1>
        </div>
        {showSuggestions ? (
          <div className="mt-8 flex max-w-2xl flex-wrap justify-center gap-3">
            {prompts.map((prompt) => {
              const isActive = activePrompt === prompt
              const hasBeenAsked = askedPrompts.has(prompt)
              return (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handlePromptClick(prompt)}
                  className={`rounded-full border px-4 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'border-white bg-white text-slate-900'
                      : hasBeenAsked
                        ? 'border-line bg-surface-2 text-muted/60 hover:border-brand hover:text-brand'
                        : 'glass border-line text-ink-2 hover:border-brand hover:text-brand'
                  }`}
                >
                  {prompt}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="mt-8 flex w-full max-w-2xl flex-col items-center gap-5">
            <div className="glass min-h-32 w-full rounded-3xl border border-line p-6 text-left text-sm text-muted">
              Your answer will appear here.
            </div>
            <button
              type="button"
              onClick={() => setShowSuggestions(true)}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-surface-solid transition-transform hover:-translate-y-0.5"
            >
              Ask another question
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
