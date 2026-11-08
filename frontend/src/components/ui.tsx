/** Small shared building blocks: Card, Badge, CountUp, IconTile. */
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useCountUp } from '../lib/useCountUp'
import type { LucideIcon } from 'lucide-react'

export function Card({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`glass min-w-0 rounded-3xl border border-line shadow-card ${className}`}
    >
      {children}
    </motion.section>
  )
}

export function CardHeader({
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  title: string
  subtitle?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
      <div className="flex items-start gap-3">
        {Icon && <IconTile icon={Icon} />}
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function IconTile({ icon: Icon, tone = 'brand' }: { icon: LucideIcon; tone?: 'brand' | 'neutral' }) {
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-xl ${
        tone === 'brand' ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-ink-2'
      }`}
    >
      <Icon className="size-[18px]" strokeWidth={2} aria-hidden />
    </span>
  )
}

export type Tone = 'good' | 'warning' | 'critical' | 'neutral' | 'brand'

const BADGE: Record<Tone, string> = {
  good: 'bg-good-soft text-good-text',
  warning: 'bg-warning-soft text-warning-text',
  critical: 'bg-critical-soft text-critical-text',
  neutral: 'bg-surface-2 text-ink-2',
  brand: 'bg-brand-soft text-brand',
}

export function Badge({ tone = 'neutral', icon: Icon, children }: { tone?: Tone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[tone]}`}>
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  )
}

/** Animates a number up to its value. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const shown = useCountUp(value)
  // Screen readers get the final number straight away
  return <span aria-label={format(value)}>{format(shown)}</span>
}

/**
 * Says where a section's numbers come from:
 *  live        = the real model / real statement
 *  placeholder = made-up demo values (not built yet, or backend offline)
 */
export function SourceTag(_props: { kind: 'live' | 'placeholder'; children?: ReactNode }) {
  // Hidden on purpose: the "Real data" / "Placeholder" labels were extra text on every card.
  // Kept as a component so the places that use it don't need changing.
  return null
}
