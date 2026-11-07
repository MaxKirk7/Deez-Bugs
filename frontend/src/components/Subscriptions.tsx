import { Repeat, TrendingUp, TriangleAlert } from 'lucide-react'
import { gbp, shortDate } from '../lib/format'
import type { Subscription } from '../types'
import { Badge, Card, CardHeader } from './ui'

/** Recurring payments found in the statement, with anything worth a second look flagged. */
export function Subscriptions({ subscriptions }: { subscriptions: Subscription[] }) {
  const total = subscriptions.reduce((s, x) => s + x.amount, 0)
  const sorted = [...subscriptions].sort((a, b) => Number(!!b.flag) - Number(!!a.flag) || b.amount - a.amount)

  return (
    <Card delay={0.2} className="flex h-full flex-col">
      <CardHeader icon={Repeat} title="Subscriptions" subtitle="Repeat payments we spotted in your statement" />
      <ul className="flex-1 px-3 pt-3 sm:px-4">
        {sorted.map((s) => (
          <li key={s.merchant} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-sm font-semibold text-ink-2">
              {s.merchant[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-medium text-ink">{s.merchant}</p>
                {s.flag && (
                  <Badge tone="warning" icon={s.flag.kind === 'price_rise' ? TrendingUp : TriangleAlert}>
                    {s.flag.kind === 'price_rise' ? 'Price went up' : 'Charged twice'}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{s.flag ? s.flag.message : `Next payment ${shortDate(s.next_date)}`}</p>
            </div>
            <p className="tabular text-sm font-semibold text-ink">
              {gbp(s.amount)}
              <span className="font-normal text-muted">/{s.cadence === 'monthly' ? 'mo' : 'yr'}</span>
            </p>
          </li>
        ))}
      </ul>
      <div className="mx-5 mt-2 mb-5 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-2.5 text-sm sm:mx-6">
        <span className="text-ink-2">Total</span>
        <span className="tabular font-medium text-ink">
          {gbp(total)}/mo <span className="text-muted">· {gbp(total * 12, 0)}/yr</span>
        </span>
      </div>
    </Card>
  )
}
