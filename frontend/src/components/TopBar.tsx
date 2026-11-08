import { useEffect, useState } from 'react'
import { AudioLines, Bot, Moon, RotateCcw, Sparkles, Sun } from 'lucide-react'
import { PAGES, type PageId } from '../lib/pages'
import type { Theme } from '../lib/useTheme'
import type { Dashboard } from '../types'
import { Logo } from './UploadScreen'

export function TopBar({
  data,
  theme,
  onToggleTheme,
  onReset,
  page,
  onNavigate,
  onAskPenny,
}: {
  data: Dashboard
  theme: Theme
  onToggleTheme: () => void
  onReset: () => void
  page: PageId
  onNavigate: (page: PageId) => void
  onAskPenny: () => void
}) {
  const toCheck = data.unusual.rows.length
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <button type="button" onClick={() => onNavigate('home')} aria-label="Home" className="shrink-0">
          <Logo />
        </button>
        <nav aria-label="Pages" className="hidden min-w-0 items-center gap-1 lg:flex">
          {PAGES.map((p) => (
            <NavLink key={p.id} active={page === p.id} onClick={() => onNavigate(p.id)} count={p.id === 'unusual' ? toCheck : 0}>
              {p.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ModePill live={data.mode === 'live'} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAskPenny()
            }}
            className="glass hidden h-9 items-center gap-1.5 rounded-full border border-line px-4 text-sm font-medium text-ink transition-colors hover:border-brand/60 sm:inline-flex"
          >
            <Sparkles className="size-3.5 text-brand" aria-hidden /> Ask Penny
          </button>
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
      {/* Small screens: the same pages as a row you can swipe */}
      <nav aria-label="Pages" className="no-scrollbar flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
        {PAGES.map((p) => (
          <NavLink key={p.id} active={page === p.id} onClick={() => onNavigate(p.id)} count={p.id === 'unusual' ? toCheck : 0}>
            {p.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}

function NavLink({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {children}
      {count > 0 && (
        <span className="grid min-w-4.5 place-items-center rounded-full bg-warning px-1 text-[10px] leading-4 font-semibold text-black">{count}</span>
      )}
    </button>
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

export function AssistantFloatingButton({ onClick, active = false }: { onClick: () => void; active?: boolean }) {
  const [visible, setVisible] = useState(false)
  const [showMessage, setShowMessage] = useState(false)

  useEffect(() => {
    const showButtonTimer = window.setTimeout(() => {
      setVisible(true)
      setShowMessage(true)
    }, 3000)
    const hideMessageTimer = window.setTimeout(() => setShowMessage(false), 8000)

    return () => {
      window.clearTimeout(showButtonTimer)
      window.clearTimeout(hideMessageTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
      {showMessage && (
        <div className="glass rounded-full border border-line px-4 py-2 text-sm text-ink-2 shadow-card" role="status">
          need any help?
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label={active ? 'Return to dashboard' : 'Open voice assistant'}
        className={`grid size-14 place-items-center rounded-full border shadow-card transition-transform hover:-translate-y-0.5 ${
          active ? 'border-brand bg-brand text-on-brand' : 'glass border-line text-ink-2 hover:border-brand hover:text-brand'
        }`}
      >
        <Bot className="size-5" aria-hidden />
        <AudioLines
          className={`absolute bottom-1 right-1 size-4 rounded-full p-px ${active ? 'bg-brand' : 'bg-bg'}`}
          aria-hidden
        />
      </button>
    </div>
  )
}
