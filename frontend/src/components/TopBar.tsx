import { Moon, RotateCcw, Sun } from 'lucide-react'
import type { Theme } from '../lib/useTheme'
import type { Dashboard } from '../types'
import { Logo } from './UploadScreen'

export function TopBar({
  data,
  theme,
  onToggleTheme,
  onReset,
}: {
  data: Dashboard
  theme: Theme
  onToggleTheme: () => void
  onReset: () => void
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          <ModePill live={data.mode === 'live'} />
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="glass grid size-9 place-items-center rounded-full border border-line text-ink-2 transition-colors hover:text-ink"
          >
            {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-surface-solid transition-transform hover:-translate-y-0.5"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">New statement</span>
          </button>
        </div>
      </div>
    </header>
  )
}

/** Green dot = talking to the real backend; amber = demo mode with placeholder model output. */
export function ModePill({ live }: { live: boolean }) {
  return (
    <span className="glass inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-2">
      <span className="relative flex size-2">
        {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />}
        <span className={`relative inline-flex size-2 rounded-full ${live ? 'bg-good' : 'bg-warning'}`} />
      </span>
      {live ? 'Live model' : 'Demo mode'}
    </span>
  )
}
