/**
 * The dashboard's pages. Each one has its own address (#/forecast, #/unusual, ...), so the
 * browser's back button, refresh and shared links all work, with no router package needed.
 */
import { useCallback, useEffect, useState } from 'react'

export const PAGES = [
  { id: 'home', label: 'Home' },
  { id: 'unusual', label: 'Fraud check' },
  { id: 'compare', label: 'People like you' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'forecast', label: 'Forecast' },
] as const

export type PageId = (typeof PAGES)[number]['id']

// Old addresses still work: patterns now lives on the forecast page, the map on home.
const MOVED: Record<string, PageId> = { patterns: 'forecast', places: 'home' }

const fromHash = (): PageId => {
  const id = window.location.hash.replace(/^#\/?/, '')
  return MOVED[id] ?? (PAGES.some((p) => p.id === id) ? (id as PageId) : 'home')
}

export function usePage(): [PageId, (page: PageId) => void] {
  const [page, setPage] = useState<PageId>(fromHash)
  useEffect(() => {
    const onHash = () => setPage(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = useCallback((next: PageId) => {
    if (next !== fromHash()) window.location.hash = `/${next}`
    setPage(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])
  return [page, go]
}
