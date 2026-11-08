import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { analyse, checkBackend } from './api'
import { Dashboard } from './components/Dashboard'
import { ProcessingScreen } from './components/ProcessingScreen'
import { UploadScreen } from './components/UploadScreen'
import { useTheme } from './lib/useTheme'
import { DEMO_FILENAME, DEMO_USER, demoPreview, demoRows, mockInsights } from './mock/demoData'
import type { Dashboard as DashboardData } from './types'

/**
 * 3 screens: upload → processing (animated steps while the API works) → dashboard
 * ?demo opens the dashboard straight away with placeholder output (for rehearsing / screenshots).
 */
type Screen =
  | { name: 'upload' }
  | { name: 'processing'; data: DashboardData | null }
  | { name: 'dashboard'; data: DashboardData }

function instantDemo(): DashboardData {
  const rows = demoRows()
  return {
    mode: 'demo',
    currency: 'GBP',
    user: { name: DEMO_USER },
    filename: DEMO_FILENAME,
    rows,
    insights: mockInsights(rows),
    preview: demoPreview(),
  }
}

export default function App() {
  const { theme, toggle } = useTheme()
  const [screen, setScreen] = useState<Screen>(() =>
    new URLSearchParams(window.location.search).has('demo') ? { name: 'dashboard', data: instantDemo() } : { name: 'upload' },
  )
  const [live, setLive] = useState<boolean | null>(null) // null = still checking
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  useEffect(() => {
    checkBackend().then(setLive)
  }, [])

  const handleFile = async (file: File | null) => {
    setError(null)
    setScreen({ name: 'processing', data: null })
    try {
      const data = await analyse(file, live === true)
      setScreen((s) => (s.name === 'processing' ? { name: 'processing', data } : s))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setScreen({ name: 'upload' })
    }
  }

  const showDashboard = useCallback(() => {
    setScreen((s) => (s.name === 'processing' && s.data ? { name: 'dashboard', data: s.data } : s))
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={screen.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {screen.name === 'upload' && <UploadScreen live={live} onFile={handleFile} />}
          {screen.name === 'processing' && <ProcessingScreen live={live === true} ready={screen.data !== null} onDone={showDashboard} />}
          {screen.name === 'dashboard' && (
            <Dashboard
              data={screen.data}
              theme={theme}
              onToggleTheme={toggle}
              onReset={() => {
                setAssistantOpen(false)
                setScreen({ name: 'upload' })
              }}
              assistantOpen={assistantOpen}
              onOpenAssistant={() => setAssistantOpen((open) => !open)}
              onCloseAssistant={() => setAssistantOpen(false)}
              muted={muted}
              onToggleMute={() => setMuted((value) => !value)}
            />
          )}
        </motion.div>
      </AnimatePresence>
      {error && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 max-w-[90vw] -translate-x-1/2 rounded-2xl bg-critical px-4 py-2 text-sm font-medium text-white shadow-card"
        >
          {error}
        </div>
      )}
    </MotionConfig>
  )
}
