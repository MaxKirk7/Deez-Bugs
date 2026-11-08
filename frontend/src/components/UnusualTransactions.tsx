import { AnimatePresence, motion } from 'motion/react'
import {
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Compass,
  MapPin,
  Moon,
  ScanSearch,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { CATEGORY } from '../lib/categories'
import { dayDate, money } from '../lib/format'
import type { Dashboard, UnusualRow } from '../types'
import { Badge, Card, CardHeader, SourceTag } from './ui'

/**
 * "Unusual transactions · Was this you?"  (real model: src/deez_bugs/fraud/)
 * Each row is one thing to check: a single purchase, or a burst of them.
 * It was me → row goes away. Not me → also taken out of the spending stats.
 */
const REASON_ICON: Record<string, LucideIcon> = {
  burst: Zap,
  place: MapPin,
  x_usual: TrendingUp,
  like_you: Users,
  night: Moon,
  rare_time: Clock,
  rare_category: Compass,
  new_shop: Store,
  pattern: Sparkles,
}
const STRONG = new Set(['burst', 'place', 'x_usual', 'like_you'])
const SHOWN = 3

/** "01:31", or nothing if the statement only has dates. */
const clock = (iso: string) => (iso.slice(11, 16) === '00:00' ? '' : iso.slice(11, 16))

function title(row: UnusualRow): string {
  const [first] = row.purchases
  const start = [dayDate(row.start), clock(row.start)].filter(Boolean).join(', ')
  if (row.kind === 'single') return `${start} · ${first.merchant}`
  const sameDay = row.start.slice(0, 10) === row.end.slice(0, 10)
  const end = sameDay ? clock(row.end) : [dayDate(row.end), clock(row.end)].filter(Boolean).join(', ')
  return `${start}${end ? ` → ${end}` : ''} · ${row.purchases.length} purchases`
}

export function UnusualTransactions({
  data,
  onAnswer,
}: {
  data: Dashboard
  onAnswer: (row: UnusualRow, wasMe: boolean) => Promise<void>
}) {
  const { unusual, currency, mode } = data
  const [busy, setBusy] = useState<UnusualRow | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? unusual.rows : unusual.rows.slice(0, SHOWN)
  const tag = mode === 'demo' && <SourceTag kind="placeholder" />

  const answer = async (row: UnusualRow, wasMe: boolean) => {
    setBusy(row)
    setError(null)
    try {
      await onAnswer(row, wasMe)
      setNote(
        wasMe
          ? 'Thanks, we won’t ask about that again.'
          : `Removed ${money(row.total, currency, 2)} from your spending. In real life, call your bank and freeze your card.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save your answer. Try again.')
    } finally {
      setBusy(null)
    }
  }

  // Nothing (left) to check: one slim line.
  if (!unusual.rows.length) {
    return (
      <Card className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
        <CircleCheck className="size-5 shrink-0 text-good" aria-hidden />
        <p className="flex-1 text-sm text-ink-2">
          {note && <span className="font-medium text-ink">{note} </span>}
          {unusual.too_few
            ? 'Not enough purchases yet to spot unusual ones.'
            : `Nothing unusual. We checked all ${unusual.checked} purchases against your habits and people like you.`}
        </p>
        {tag}
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        icon={ScanSearch}
        title="Unusual transactions · Was this you?"
        subtitle="Purchases that don’t look like your usual spending"
        action={
          <div className="flex shrink-0 items-center gap-2">
            {tag}
            <Badge tone="warning">{unusual.rows.length} to check</Badge>
          </div>
        }
      />
      <ul className="px-3 pt-3 sm:px-4">
        <AnimatePresence initial={false}>
          {rows.map((row) => (
            <motion.li
              key={`${row.start}|${row.purchases[0].merchant}`}
              layout
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden rounded-2xl px-2 py-3 transition-colors hover:bg-surface-2"
            >
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2.5">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm font-medium text-ink">
                    {title(row)}
                    {row.kind === 'single' && (
                      <span className="font-normal text-muted"> · {CATEGORY[row.purchases[0].category].label}</span>
                    )}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {row.reasons.map((r) => (
                      <Badge key={r.kind} tone={STRONG.has(r.kind) ? 'warning' : 'neutral'} icon={REASON_ICON[r.kind] ?? Sparkles}>
                        {r.text}
                      </Badge>
                    ))}
                  </div>
                  {row.kind === 'burst' && (
                    <p className="mt-1.5 text-xs text-muted">
                      {row.purchases.map((p) => `${p.merchant} ${money(p.amount, currency)}`).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <p className="tabular text-sm font-semibold text-ink">{money(row.total, currency, 2)}</p>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => answer(row, true)}
                    aria-label={`It was me: ${title(row)}`}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
                  >
                    <Check className="size-3.5" aria-hidden /> It was me
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => answer(row, false)}
                    aria-label={`Not me: ${title(row)}`}
                    className="inline-flex items-center gap-1 rounded-full bg-critical-soft px-3 py-1.5 text-xs font-medium text-critical-text transition-opacity hover:opacity-80 disabled:opacity-50"
                  >
                    <X className="size-3.5" aria-hidden /> {busy === row ? 'Saving…' : 'Not me'}
                  </button>
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-1 pb-4 text-sm sm:px-6">
        <p className={error ? 'text-critical-text' : 'text-ink-2'} role="status">
          {error ?? note}
        </p>
        {unusual.rows.length > SHOWN && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand"
          >
            {showAll ? 'Show fewer' : `Show ${unusual.rows.length - SHOWN} more`}
            <ChevronDown className={`size-4 transition-transform ${showAll ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>
    </Card>
  )
}
