import { Sparkles } from 'lucide-react'
import type { Dashboard } from '../types'
import { Card, CardHeader, SourceTag } from './ui'

/**
 * EMPTY SLOT: the "People like you" graph used to live here.
 * A new feature will replace this box. It already receives the same `data`
 * as every other card (data.insights, data.rows, data.currency, ...).
 */
export function NewFeatureSlot({ data: _data }: { data: Dashboard }) {
  return (
    <Card delay={0.1} className="flex flex-col">
      <CardHeader icon={Sparkles} title="Coming soon" subtitle="A new feature is on its way here." action={<SourceTag kind="placeholder" />} />
      <div className="m-5 flex min-h-48 flex-1 items-center justify-center rounded-2xl border border-dashed border-line text-sm text-muted sm:m-6">
        New feature goes here
      </div>
    </Card>
  )
}
