import type { Currency } from '../types'

const formatters = new Map<string, Intl.NumberFormat>()

/** £1,234 / $1,234 (or with pence/cents). */
export function money(n: number, currency: Currency = 'GBP', decimals: 0 | 2 = 0): string {
  const key = `${currency}${decimals}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(currency === 'GBP' ? 'en-GB' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    formatters.set(key, f)
  }
  return f.format(n)
}

/** Old name used by the preview components (always £, the demo student's currency). */
export const gbp = (n: number, decimals: 0 | 2 = 2) => money(n, 'GBP', decimals)

/** 0.143 → "14%" */
export const pct = (share: number) => `${Math.round(share * 100)}%`

/** "19 Nov" */
export function shortDate(iso: string): string {
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** "Thu 19 Nov" */
export function dayDate(iso: string): string {
  return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** "More than most on Eating out & Entertainment" → "Eating out & Entertainment" (k-means group name) */
export const groupName = (name: string) => name.replace(/^More than most on /, '')
