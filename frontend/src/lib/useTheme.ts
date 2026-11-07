import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'penny-theme'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function savedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

// Set the attribute straight away (not in an effect) so charts that read the
// colour tokens during the same render already see the new theme.
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

/** Light/dark theme: follows the OS until the user picks one, then remembers it. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = savedTheme() ?? systemTheme()
    apply(t)
    return t
  })

  // Follow OS changes while the user hasn't chosen
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (savedTheme()) return
      const t = systemTheme()
      apply(t)
      setTheme(t)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    apply(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* storage blocked: theme still switches for this visit */
    }
    setTheme(next)
  }, [theme])

  return { theme, toggle }
}

/**
 * Read the current CSS colour tokens (charts need real colour values, not var()).
 * Takes the theme so callers can write useMemo(() => readTokens(theme), [theme]).
 */
export function readTokens(_theme: Theme) {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string) => s.getPropertyValue(name).trim()
  return {
    brand: v('--brand'),
    compare: v('--compare'),
    grid: v('--grid'),
    axis: v('--axis'),
    muted: v('--muted'),
    ink: v('--ink'),
    ink2: v('--ink-2'),
    surface: v('--surface'),
  }
}
export type Tokens = ReturnType<typeof readTokens>
