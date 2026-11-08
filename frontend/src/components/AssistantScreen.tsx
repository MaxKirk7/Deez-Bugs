import { useEffect, useMemo, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { motion } from 'motion/react'
import { askAssistant, speakAssistant } from '../api'
import type { AssistantProfile, Dashboard as DashboardData } from '../types'

const prompts = [
  'Explain my monthly habits',
  'Tell me my top worst spending habits',
  'How can I save more money?',
  'Find my recurring subscriptions',
  'Give me a spending summary',
]
const THINKING_TEXT = 'Thinking about your spending...'

export function AssistantScreen({
  data,
  muted,
  onToggleMute,
  onClose,
}: {
  data: DashboardData
  muted: boolean
  onToggleMute: () => void
  onClose: () => void
}) {
  const [activePrompt, setActivePrompt] = useState<string | null>(null)
  const [askedPrompts, setAskedPrompts] = useState<Set<string>>(new Set())
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [summary, setSummary] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<AudioBufferSourceNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const disposedRef = useRef(false)
  const speechControllerRef = useRef<AbortController | null>(null)

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
      setSummary([])
      setError(null)
      speechControllerRef.current?.abort()
      const speechController = new AbortController()
      speechControllerRef.current = speechController
      askAssistant(activePrompt, profile)
        .then((result) => {
          setSummary(
            (result.summary || result.answer)
              .split('\n')
              .map((point) => point.replace(/\*\*/g, '').replace(/^[-*]\s*/, '').trim())
              .filter(Boolean),
          )
          if (!muted) {
            const audioContext = audioContextRef.current
            if (!audioContext) return
            return speakAssistant(result.answer, speechController.signal, audioContext).then((audio) => {
              if (disposedRef.current || muted) {
                audio.stop()
                return
              }
              audioRef.current?.stop()
              audioRef.current = audio
            })
          }
        })
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to generate an answer.'))
        .finally(() => setLoading(false))
    }, 100)

    return () => window.clearTimeout(timer)
  }, [activePrompt, muted, profile])

  useEffect(() => {
    if (muted) {
      audioRef.current?.stop()
      audioRef.current = null
    }
  }, [muted])

  useEffect(() => {
    disposedRef.current = false

    return () => {
      disposedRef.current = true
      speechControllerRef.current?.abort()
      audioRef.current?.stop()
      audioRef.current = null
      void audioContextRef.current?.close()
    }
  }, [])

  const handlePromptClick = (prompt: string) => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext()
    void audioContextRef.current.resume()
    setActivePrompt(prompt)
  }

  const handleAskAnother = () => {
    audioRef.current?.stop()
    audioRef.current = null
    setShowSuggestions(true)
  }

  const handleClose = () => {
    speechControllerRef.current?.abort()
    audioRef.current?.stop()
    audioRef.current = null
    onClose()
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close assistant"
        onClick={handleClose}
        className="fixed inset-0 z-30 bg-black/10"
      />
      <aside
        aria-label="AI assistant"
        className="fixed inset-y-0 right-0 z-40 w-full min-w-[22rem] max-w-[33.333vw] overflow-y-auto border-l border-line bg-bg p-6 shadow-2xl sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <main className="flex min-h-full flex-col items-center pt-12 text-center">
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
                <ul className="list-disc space-y-2 pl-5">
                  {summary.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={handleAskAnother}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-surface-solid transition-transform hover:-translate-y-0.5"
            >
              Ask another question
            </button>
          </div>
        )}
        </main>
      </aside>
    </>
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
