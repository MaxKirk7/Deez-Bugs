import { Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { peerHabits, type PeerHabits } from '../api'
import { money, pct } from '../lib/format'
import type { Dashboard } from '../types'
import { Card, SourceTag } from './ui'

/**
 * "Your biggest priority": the model's top recommendation as one sentence, then HOW your 20 peers
 * (KNN) do it differently: how often they buy, and (same currency only) how much per purchase.
 * Peer amounts are in the dataset's currency (USD), so for a GBP statement only visit counts
 * and shares are compared.
 */
export function Priority({ data }: { data: Dashboard }) {
  const { insights, currency, mode } = data
  const rec = insights.recommendations[0]
  const [habits, setHabits] = useState<PeerHabits | null>(null)

  useEffect(() => {
    if (!rec || mode !== 'live') return
    let on = true
    peerHabits(insights.cc_num, rec.category)
      .then((h) => on && setHabits(h))
      .catch(() => {})
    return () => {
      on = false
    }
  }, [rec, mode, insights.cc_num])

  if (!rec) return null
  const sameMoney = currency === 'USD' // peers' amounts are in the dataset's currency
  const you = habits?.you
  const them = habits?.peers_median

  let plan = ''
  if (you && them) {
    if (you.visits_a_month > them.visits_a_month * 1.2) {
      plan = `Cutting to about ${Math.max(1, Math.round(them.visits_a_month))} purchases a month is your quickest win.`
    } else if (sameMoney && you.per_visit > them.per_visit * 1.2) {
      plan = `You don’t buy more often than them, but you spend more each time: aim for about ${money(them.per_visit, currency)} a purchase.`
    } else {
      plan = 'You don’t buy more often than them, so it’s the size of each purchase: plan the big ones and skip the extras.'
    }
  }

  return (
    <Card className="border-brand/40 p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-brand uppercase">
          <Target className="size-4" aria-hidden /> Your biggest priority
        </p>
        <SourceTag kind={mode === 'live' ? 'live' : 'placeholder'} />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Reduce {rec.label.toLowerCase()}.</p>
      <p className="mt-2 text-lg text-ink-2">
        <b className="text-ink">{pct(rec.your_share)}</b> of your money goes here. Your {insights.neighbours.length} closest peers spend{' '}
        <b className="text-ink">{pct(rec.neighbours_share)}</b>. Matching them frees up about{' '}
        <b className="text-good-text">{money(rec.est_monthly_saving, currency)} a month</b>.
      </p>

      {you && them && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Stat who="You" visits={you.visits_a_month} perVisit={sameMoney ? money(you.per_visit, currency) : null} />
          <Stat who="Your peers" visits={them.visits_a_month} perVisit={sameMoney ? money(them.per_visit, currency) : null} />
        </div>
      )}
      {plan && <p className="mt-4 text-ink">{plan}</p>}
      {sameMoney && habits && habits.peer_shops.length > 0 && (
        <p className="mt-2 text-sm text-ink-2">
          Popular with your peers instead: {habits.peer_shops.map((s) => s.merchant).join(', ')}.
        </p>
      )}
    </Card>
  )
}

function Stat({ who, visits, perVisit }: { who: string; visits: number; perVisit: string | null }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <p className="text-xs font-semibold tracking-widest text-muted uppercase">{who}</p>
      <p className="mt-1 text-ink">
        <b className="tabular text-2xl">{visits}</b> purchases a month
        {perVisit && (
          <>
            {' '}
            · <b className="tabular">{perVisit}</b> each
          </>
        )}
      </p>
    </div>
  )
}
