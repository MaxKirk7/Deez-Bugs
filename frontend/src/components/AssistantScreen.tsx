import { useEffect, useMemo, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { askAssistant } from '../api'
import type { Theme } from '../lib/useTheme'
import type { AssistantProfile, Dashboard as DashboardData } from '../types'
import { TopBar } from './TopBar'

const prompts = [
  'Explain my monthly habits',
  'Tell me my top worst spending habits',
  'How can I save more money?',
  'Find my recurring subscriptions',
  'Give me a spending summary',
]
const SENTENCE_DELAY_MS = 2200
const WORD_DELAY_MS = 180
const THINKING_TEXT = 'Thinking about your spending...'

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
  const [answer, setAnswer] = useState<string | null>(null)
  const [sentenceIndex, setSentenceIndex] = useState(0)
  const [visibleWordCount, setVisibleWordCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const profile = useMemo<AssistantProfile>(
    () => ({
      currency: data.currency,
      total_spend: data.rows.reduce((total, row) => total + row.amt, 0),
      monthly_spend: data.rows.reduce<Record<string, number>>((totals, row) => {
        const month = row.trans_date_trans_time.slice(0, 7)
        totals[month] = (totals[month] ?? 0) + row.amt
        return totals
      }, {}),
      category_spend: data.rows.reduce<Record<string, number>>((totals, row) => {
        totals[row.category] = (totals[row.category] ?? 0) + row.amt
        return totals
      }, {}),
      recommendations: data.insights.recommendations,
    }),
    [data],
  )

  useEffect(() => {
    if (!activePrompt) return

    const timer = window.setTimeout(() => {
      setAskedPrompts((current) => new Set(current).add(activePrompt))
      setActivePrompt(null)
      setShowSuggestions(false)
      setLoading(true)
      setAnswer(null)
      setError(null)
      askAssistant(activePrompt, profile)
        .then(setAnswer)
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to generate an answer.'))
        .finally(() => setLoading(false))
    }, 100)

    return () => window.clearTimeout(timer)
  }, [activePrompt, profile])

  useEffect(() => {
    if (!answer) {
      setSentenceIndex(0)
      setVisibleWordCount(0)
      return
    }

    setSentenceIndex(0)
    setVisibleWordCount(0)
  }, [answer])

  const sentences = answer?.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? []
  const currentWords = sentences[sentenceIndex]?.split(/\s+/) ?? []
  const visibleSentence = currentWords.slice(0, visibleWordCount).join(' ')
  const isSentenceComplete = visibleWordCount >= currentWords.length

  useEffect(() => {
    if (!answer || !sentences.length) return

    const timer = window.setTimeout(
      () => {
        if (!isSentenceComplete) {
          setVisibleWordCount((count) => count + 1)
        } else if (sentenceIndex < sentences.length - 1) {
          setSentenceIndex((index) => index + 1)
          setVisibleWordCount(0)
        }
      },
      isSentenceComplete ? SENTENCE_DELAY_MS : WORD_DELAY_MS,
    )

    return () => window.clearTimeout(timer)
  }, [answer, currentWords.length, sentenceIndex, sentences.length, visibleWordCount, isSentenceComplete])

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
            <div
              aria-live="polite"
              className="glass min-h-32 w-full rounded-3xl border border-line p-6 text-left text-sm text-ink-2 transition-opacity duration-300"
            >
              {loading ? (
                <ThinkingIndicator />
              ) : error ? (
                error
              ) : (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={visibleSentence}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.3 }}
                  >
                    {visibleSentence || 'Your answer will appear here.'}
                  </motion.p>
                </AnimatePresence>
              )}
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

function ThinkingIndicator() {
  return (
    <span aria-label={THINKING_TEXT}>
      {THINKING_TEXT.split('').map((character, index) => (
        <motion.span
          key={`${character}-${index}`}
          animate={{ color: ['var(--muted)', 'var(--ink-2)', 'var(--muted)'] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.045, ease: 'easeInOut' }}
        >
          {character === ' ' ? '\u00a0' : character}
        </motion.span>
      ))}
    </span>
  )
}
