/**
 * Everything the frontend asks the backend for goes through this file.
 *
 * The app checks if the FastAPI backend is running (uv run python -m uvicorn deez_bugs.api.api:app):
 *   running  → LIVE: the statement is uploaded and the REAL model's output is shown
 *   offline  → DEMO: the model sections show PLACEHOLDER output
 * VITE_USE_MOCK=true forces demo mode.
 *
 * Vite forwards /api/... to http://localhost:8000/... (see vite.config.ts).
 */
import { agentScripts } from './mock/agentDemo'
import { DEMO_FILENAME, DEMO_USER, demoPreview, demoRows, mockInsights, mockUnusual, toCsv } from './mock/demoData'
import { CATEGORIES } from './lib/categories'
import { placesFromRows } from './lib/places'
import type {
  AgentResult,
  AgentStep,
  AssistantProfile,
  Category,
  Dashboard,
  Insights,
  Places,
  StatementRow,
  Unusual,
  UnusualRow,
  UploadResult,
} from './types'

const FORCE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed (${res.status})`)
  }
  return res.json()
}

/** Is the real backend reachable? Also starts training the model in the background (~10–40 s the first time). */
export async function checkBackend(): Promise<boolean> {
  if (FORCE_MOCK) return false
  try {
    const res = await fetch('/api/openapi.json', { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    fetch('/api/users/0/insights').catch(() => {}) // warm-up: the model trains on its first call
    return true
  } catch {
    return false
  }
}

/** Read a CSV in the browser (needed for the heatmap). Expects the backend's 4 columns. */
export function parseStatement(text: string): StatementRow[] {
  const lines = text.trim().split(/\r?\n/)
  const split = (line: string) => {
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && line[i + 1] === '"' && quoted) {
        cur += '"'
        i++
      } else if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    return [...out, cur]
  }
  const head = split(lines[0]).map((h) => h.trim())
  const col = (name: string) => head.indexOf(name)
  const [t, m, c, a] = ['trans_date_trans_time', 'merchant', 'category', 'amt'].map(col)
  if ([t, m, c, a].some((i) => i < 0)) throw new Error('CSV needs the columns trans_date_trans_time, merchant, category, amt')
  return lines
    .slice(1)
    .map(split)
    .map((f) => ({ trans_date_trans_time: f[t], merchant: f[m], category: f[c] as Category, amt: Number(f[a]) }))
    .filter((r) => r.amt > 0 && CATEGORIES.includes(r.category))
}

/** Upload a statement (or Alex's demo statement when file is null) and build the dashboard. */
export async function analyse(file: File | null, live: boolean): Promise<Dashboard> {
  const demo = file === null
  const csv = demo ? toCsv(demoRows()) : await file.text()
  const rows = parseStatement(csv)
  const base = {
    currency: demo ? ('GBP' as const) : ('USD' as const), // the dataset is in USD
    user: { name: demo ? DEMO_USER : 'there' },
    filename: demo ? DEMO_FILENAME : file.name,
    rows,
    preview: demoPreview(),
  }

  if (!live) {
    await wait(400)
    return { ...base, mode: 'demo', insights: mockInsights(rows), places: placesFromRows(rows), unusual: mockUnusual(rows) }
  }

  // Alex is uploaded once, then re-used: no new copy in the database on every click.
  if (demo) {
    const saved = readSavedDemoId()
    if (saved !== null) {
      try {
        return { ...base, mode: 'live', ...(await liveResults(saved)) }
      } catch {
        // deleted or database reset: upload again below
      }
    }
  }

  const body = new FormData()
  body.append('file', new File([csv], base.filename, { type: 'text/csv' }))
  const uploaded = await getJson<UploadResult>('/api/upload-csv/', { method: 'POST', body })
  if (demo) saveDemoId(uploaded.cc_num)
  return { ...base, mode: 'live', ...(await liveResults(uploaded.cc_num)) }
}

/** The real model's output + the map data + the "Was this you?" check for one user, fetched together. */
async function liveResults(ccNum: number): Promise<{ insights: Insights; places: Places; unusual: Unusual }> {
  const [insights, places, unusual] = await Promise.all([
    getJson<Insights>(`/api/users/${ccNum}/insights`),
    getJson<Places>(`/api/users/${ccNum}/places`),
    getJson<Unusual>(`/api/users/${ccNum}/unusual`),
  ])
  return { insights, places, unusual }
}

/** Same purchase in the CSV and in the backend's answer? (minute + shop; the backend drops the "fraud_" prefix) */
const purchaseKey = (ts: string, merchant: string) => `${ts.replace('T', ' ').slice(0, 16)}|${merchant.replace(/^fraud_/, '')}`

/**
 * The answer to "Was this you?" for one row. Returns the updated dashboard:
 *   it was me → the row goes away (never asked again)
 *   not me    → also removed from the spending: score, groups, map and calendar are refreshed
 */
export async function answerUnusual(data: Dashboard, row: UnusualRow, wasMe: boolean): Promise<Dashboard> {
  const unusual = { ...data.unusual, rows: data.unusual.rows.filter((r) => r !== row) }
  const gone = new Set(row.purchases.map((p) => purchaseKey(p.ts, p.merchant)))
  const rows = wasMe ? data.rows : data.rows.filter((r) => !gone.has(purchaseKey(r.trans_date_trans_time, r.merchant)))

  if (data.mode === 'demo') {
    await wait(300)
    return wasMe ? { ...data, unusual } : { ...data, rows, unusual, insights: mockInsights(rows), places: placesFromRows(rows) }
  }
  const ccNum = data.unusual.cc_num
  await getJson(`/api/users/${ccNum}/unusual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ was_me: wasMe, purchases: row.purchases.map(({ ts, merchant }) => ({ ts, merchant })) }),
  })
  return wasMe ? { ...data, unusual } : { ...data, rows, ...(await liveResults(ccNum)) }
}

/** "Delete my data": removes an uploaded user and all their transactions. */
export async function deleteUpload(ccNum: number): Promise<void> {
  await getJson(`/api/users/${ccNum}`, { method: 'DELETE' })
  if (readSavedDemoId() === ccNum) saveDemoId(null)
}

export async function askAssistant(
  question: string,
  profile: AssistantProfile,
): Promise<{ answer: string; summary: string }> {
  const result = await getJson<{ answer: string; summary: string }>('/api/assistant/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, profile }),
  })
  if (typeof result.answer !== 'string' || typeof result.summary !== 'string') {
    throw new Error('The backend returned an incomplete assistant response. Restart the backend and try again.')
  }
  return result
}

export async function speakAssistant(
  text: string,
  signal: AbortSignal | undefined,
  audioContext: AudioContext,
): Promise<AudioBufferSourceNode> {
  const response = await fetch('/api/assistant/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? `Speech request failed (${response.status})`)
  }
  const buffer = await audioContext.decodeAudioData(await response.arrayBuffer())
  const source = audioContext.createBufferSource()
  source.buffer = buffer
  source.connect(audioContext.destination)
  source.start()
  return source
}

const DEMO_ID_KEY = 'penny.demoCcNum.v3' // v3: Alex with purchases to check ("Was this you?")

function readSavedDemoId(): number | null {
  try {
    const v = localStorage.getItem(DEMO_ID_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

function saveDemoId(ccNum: number | null) {
  try {
    if (ccNum === null) localStorage.removeItem(DEMO_ID_KEY)
    else localStorage.setItem(DEMO_ID_KEY, String(ccNum))
  } catch {
    // storage blocked (private mode): fine, Alex just gets uploaded again
  }
}

/** PLACEHOLDER: the savings agent isn't built yet, so this always plays a scripted run. */
export async function researchSavings(opportunityId: string, onStep: (step: AgentStep) => void): Promise<AgentResult> {
  const script = agentScripts[opportunityId] ?? agentScripts.groceries
  for (const step of script.steps) {
    await wait(step.kind === 'visit' ? 1100 : 750)
    onStep(step)
  }
  await wait(500)
  return script.result
}

/** You vs your 20 nearest neighbours (KNN) in one category: GET /users/{cc_num}/peers/{category}. */
export interface PeerHabits {
  label: string
  peers: number
  window_days: number
  you: { visits_a_month: number; per_visit: number; a_month: number }
  peers_median: { visits_a_month: number; per_visit: number; a_month: number }
  peer_shops: { merchant: string; peers: number }[]
}
export async function peerHabits(ccNum: number, category: string): Promise<PeerHabits> {
  return getJson<PeerHabits>(`/api/users/${ccNum}/peers/${category}`)
}
