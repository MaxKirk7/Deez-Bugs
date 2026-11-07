import { useState } from 'react'
import type { Preview as PreviewData } from '../types'
import type { Theme } from '../lib/useTheme'
import { ForecastChart } from './ForecastChart'
import { SavingsAgent } from './SavingsAgent'
import { Subscriptions } from './Subscriptions'
import { SourceTag } from './ui'

const TABS = [
  { id: 'forecast', label: 'Month forecast' },
  { id: 'subs', label: 'Subscriptions' },
  { id: 'agent', label: 'Savings agent' },
] as const

/**
 * Features that aren't in the backend yet. They always use Alex's made-up demo
 * numbers, and the whole section is tagged PLACEHOLDER so nobody mistakes them for real.
 */
export function Preview({ data, theme }: { data: PreviewData; theme: Theme }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('forecast')
  return (
    <section aria-labelledby="preview-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="preview-title" className="text-lg font-semibold tracking-tight text-ink">
            Coming next
          </h2>
          <p className="text-sm text-muted">Not built in the backend yet. Shown with Alex’s demo numbers.</p>
        </div>
        <SourceTag kind="placeholder">Placeholder · dummy data</SourceTag>
      </div>
      <div role="tablist" className="glass inline-flex rounded-full border border-line p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-ink text-surface-solid' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="opacity-90">
        {tab === 'forecast' && <ForecastChart forecast={data.forecast} month={data.month} theme={theme} />}
        {tab === 'subs' && <Subscriptions subscriptions={data.subscriptions} />}
        {tab === 'agent' && <SavingsAgent savings={data.savings} />}
      </div>
    </section>
  )
}
