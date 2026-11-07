/**
 * The demo student, "Alex" (2nd year, Edinburgh, £).
 *
 *  demoRows()      Alex's bank statement in the backend's upload format (real input:
 *                  when the backend is running it's uploaded and run through the REAL model)
 *  demoPreview()   forecast, subscriptions, savings ideas: PLACEHOLDER (not in the backend yet)
 *  mockInsights()  PLACEHOLDER model output, used only when the backend is offline
 *
 * Transactions come from a fixed random seed, so the numbers are the same every run.
 */
import { CATEGORIES, CATEGORY } from '../lib/categories'
import { shortDate } from '../lib/format'
import type { Category, ForecastPoint, Insights, Preview, SavingsOpportunity, StatementRow, Subscription } from '../types'

export const DEMO_USER = 'Alex'
export const DEMO_FILENAME = 'alex_statement.csv'
const START = '2026-09-01'
const AS_OF = '2026-11-19' // "today" in the demo
const BUDGET = 1350
/** Seed picked so the demo tells a clear story (over budget, takeaways creeping up). */
const DEMO_SEED = 323

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Rent and bills aren't in the backend's 14 categories (the dataset has none),
// so they're only used by the placeholder forecast, never uploaded.
type DemoCat = Category | 'rent' | 'bills'
interface Txn {
  date: string
  merchant: string
  amount: number // spent, positive
  category: DemoCat
}

type M = readonly [string, number, number, Category]
const GROCERIES: M[] = [
  ['Tesco Express', 6, 24, 'grocery_pos'],
  ['Tesco Express', 8, 22, 'grocery_pos'],
  ['Sainsbury’s Local', 7, 26, 'grocery_pos'],
  ['Aldi', 18, 38, 'grocery_pos'],
  ['Co-op', 4, 14, 'grocery_pos'],
]
const EATING_OUT: M[] = [
  ['Deliveroo', 14, 24, 'food_dining'],
  ['Deliveroo', 13, 22, 'food_dining'],
  ['Uber Eats', 12, 21, 'food_dining'],
  ['Greggs', 3, 6, 'food_dining'],
  ['Pret A Manger', 5, 9, 'food_dining'],
  ['Starbucks', 3.5, 5.5, 'food_dining'],
  ['Nando’s', 15, 26, 'food_dining'],
]
const TAKEAWAY_APPS = new Set(['Deliveroo', 'Uber Eats'])
const TRANSPORT: M[] = [
  ['Lothian Buses', 2, 2, 'gas_transport'],
  ['Lothian Buses', 2, 2, 'gas_transport'],
  ['Lothian Buses', 4.8, 4.8, 'gas_transport'],
]
const SHOPPING: M[] = [
  ['ASOS', 18, 55, 'shopping_net'],
  ['Amazon', 8, 35, 'shopping_net'],
  ['Primark', 10, 28, 'shopping_pos'],
  ['Boots', 5, 18, 'personal_care'],
]
const ENTERTAINMENT: M[] = [
  ['Students’ Union Bar', 8, 24, 'entertainment'],
  ['Cineworld', 9, 14, 'entertainment'],
  ['BrewDog', 10, 26, 'entertainment'],
  ['Skiddle', 12, 22, 'entertainment'],
]
// Recurring: [name, £, day of month, category]
const RECURRING: readonly [string, number, number, DemoCat][] = [
  ['Rent', 600, 1, 'rent'],
  ['Disney+', 8.99, 2, 'entertainment'],
  ['PureGym', 24.99, 3, 'health_fitness'],
  ['Netflix', 10.99, 5, 'entertainment'],
  ['giffgaff', 10, 8, 'bills'],
  ['Spotify', 5.99, 12, 'entertainment'],
  ['iCloud+', 2.99, 15, 'misc_net'],
  ['Amazon Prime', 4.49, 20, 'misc_net'],
]
const SUBSCRIPTIONS = new Set(['Disney+', 'PureGym', 'Netflix', 'Spotify', 'iCloud+', 'Amazon Prime'])
const priceIn = (merchant: string, month: number, normal: number) =>
  merchant === 'Disney+' && month === 10 ? 9.99 : normal // Disney+ went up in November

const iso = (d: Date) => d.toISOString().slice(0, 10)

function generate(): Txn[] {
  const rand = mulberry32(DEMO_SEED)
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 100) / 100
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
  const out: Txn[] = []
  const spend = (date: string, [merchant, lo, hi, category]: M) => out.push({ date, merchant, amount: between(lo, hi), category })

  for (let d = new Date(START); iso(d) <= AS_OF; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = iso(d)
    const dom = d.getUTCDate()
    const dow = d.getUTCDay()
    const weekend = dow === 0 || dow === 5 || dow === 6
    const month = d.getUTCMonth()
    const nov = month === 10

    for (const [merchant, amount, day, category] of RECURRING) {
      if (dom === day) out.push({ date, merchant, amount: priceIn(merchant, month, amount), category })
    }
    if (date === '2026-11-12') out.push({ date, merchant: 'Spotify', amount: 5.99, category: 'entertainment' }) // charged twice
    if (rand() < 0.48) spend(date, pick(GROCERIES))
    if (rand() < (nov ? 0.55 : 0.42) + (weekend ? 0.15 : 0)) spend(date, pick(EATING_OUT))
    if (dow >= 1 && dow <= 5 && rand() < 0.7) spend(date, pick(TRANSPORT))
    if (rand() < 0.04) spend(date, ['Uber', 7, 15, 'gas_transport'])
    if (rand() < (nov ? 0.13 : 0.08)) spend(date, pick(SHOPPING))
    if (weekend && rand() < 0.5) spend(date, pick(ENTERTAINMENT))
  }
  return out
}

const TXNS = generate()
const round2 = (n: number) => Math.round(n * 100) / 100
const total = (xs: Txn[]) => round2(xs.reduce((s, t) => s + t.amount, 0))
const dayOf = (t: Txn) => Number(t.date.slice(8, 10))

// ── Where Alex lives and shops (real Edinburgh locations, for the map) ─────
export const DEMO_HOME = { lat: 55.9365, long: -3.1945, city: 'Edinburgh' } // student flat in Marchmont
/** In-person shops only. Online shops, apps, subscriptions and bus fares have no location (like a real statement). */
const SHOP_LOCATIONS: Record<string, readonly [number, number]> = {
  'Tesco Express': [55.9389, -3.1911],
  'Sainsbury’s Local': [55.9445, -3.1838],
  Aldi: [55.937, -3.229],
  'Co-op': [55.9372, -3.2063],
  Greggs: [55.9487, -3.1867],
  'Pret A Manger': [55.9478, -3.1925],
  Starbucks: [55.944, -3.1885],
  'Nando’s': [55.9455, -3.2055],
  Primark: [55.9535, -3.1945],
  Boots: [55.9525, -3.1925],
  'Students’ Union Bar': [55.9454, -3.1892],
  Cineworld: [55.942, -3.2175],
  BrewDog: [55.9489, -3.1875],
  PureGym: [55.9462, -3.2087],
}

// ── The statement, in the backend's upload format ─────────────────────────
export function demoRows(): StatementRow[] {
  return TXNS.filter((t): t is Txn & { category: Category } => t.category !== 'rent' && t.category !== 'bills').map((t, i) => {
    const shop = SHOP_LOCATIONS[t.merchant]
    const jitter = (k: number) => (((i * k) % 13) - 6) * 0.00008 // tills / doors a few metres apart
    return {
      // spread the times through the day so it looks like a real statement
      trans_date_trans_time: `${t.date} ${String(9 + ((i * 7) % 13)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}:00`,
      merchant: t.merchant,
      category: t.category,
      amt: t.amount,
      merch_lat: shop ? Math.round((shop[0] + jitter(5)) * 1e6) / 1e6 : null,
      merch_long: shop ? Math.round((shop[1] + jitter(11)) * 1e6) / 1e6 : null,
      lat: DEMO_HOME.lat,
      long: DEMO_HOME.long,
      city: DEMO_HOME.city,
    }
  })
}

/** CSV text in the POST /upload-csv/ format: the 4 required columns + optional location columns. */
export function toCsv(rows: StatementRow[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const opt = (v: number | string | null | undefined) => (v == null ? '' : String(v))
  return [
    'trans_date_trans_time,merchant,category,amt,merch_lat,merch_long,lat,long,city',
    ...rows.map((r) =>
      [r.trans_date_trans_time, esc(r.merchant), r.category, r.amt, opt(r.merch_lat), opt(r.merch_long), opt(r.lat), opt(r.long), esc(opt(r.city))].join(','),
    ),
  ].join('\n')
}

// ── PLACEHOLDER: forecast, subscriptions, savings ideas ───────────────────
export function demoPreview(): Preview {
  const asOfDay = Number(AS_OF.slice(8, 10))
  const daysInMonth = 30
  const thisMonth = TXNS.filter((t) => t.date.startsWith('2026-11'))
  const lastMonth = TXNS.filter((t) => t.date.startsWith('2026-10'))
  const isFixed = (t: Txn) => t.category === 'rent' || t.category === 'bills' || SUBSCRIPTIONS.has(t.merchant)

  const variable = thisMonth.filter((t) => !isFixed(t))
  const perDay = total(variable) / asOfDay
  const dueBy = (day: number) =>
    RECURRING.filter(([, , d]) => d > asOfDay && d <= day).reduce((s, [m, a]) => s + priceIn(m, 10, a), 0)
  const spent = total(thisMonth)
  const at = (day: number) => spent + perDay * (day - asOfDay) + dueBy(day)
  const daily = Array.from({ length: asOfDay }, (_, i) => total(variable.filter((t) => dayOf(t) === i + 1)))
  const mean = daily.reduce((a, b) => a + b, 0) / daily.length
  const sd = Math.sqrt(daily.reduce((s, x) => s + (x - mean) ** 2, 0) / daily.length)
  const spread = (day: number) => 1.28 * sd * Math.sqrt(Math.max(0, day - asOfDay))
  const cumulative = (xs: Txn[], upTo: number) => total(xs.filter((t) => dayOf(t) <= upTo))

  const forecast: ForecastPoint[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const future = day >= asOfDay
    return {
      day,
      actual: day <= asOfDay ? cumulative(thisMonth, day) : null,
      projected: future ? Math.round(at(day)) : null,
      low: future ? Math.round(at(day) - spread(day)) : null,
      high: future ? Math.round(at(day) + spread(day)) : null,
      last_month: cumulative(lastMonth, day),
    }
  })

  const subscriptions: Subscription[] = [...SUBSCRIPTIONS].map((merchant) => {
    const list = TXNS.filter((t) => t.merchant === merchant).sort((a, b) => (a.date < b.date ? -1 : 1))
    const latest = list[list.length - 1]
    const earlier = list.filter((t) => t.date.slice(0, 7) < latest.date.slice(0, 7))
    const before = earlier.length ? earlier[earlier.length - 1].amount : latest.amount
    const charges = list.filter((t) => t.date.startsWith('2026-11')).length
    const next = new Date(latest.date + 'T00:00:00Z')
    next.setUTCMonth(next.getUTCMonth() + 1)
    let flag: Subscription['flag'] = null
    if (charges > 1) flag = { kind: 'duplicate', message: `Charged ${charges}× on ${shortDate(latest.date)}: ask for a refund` }
    else if (latest.amount > before) flag = { kind: 'price_rise', message: `Went up from £${before.toFixed(2)} this month` }
    return { merchant, amount: latest.amount, cadence: 'monthly', next_date: iso(next), flag }
  })

  const takeaways = thisMonth.filter((t) => TAKEAWAY_APPS.has(t.merchant))
  const avg = total(takeaways) / takeaways.length
  const groceries = thisMonth.filter((t) => t.category === 'grocery_pos')
  const savings: SavingsOpportunity[] = [
    {
      id: 'groceries',
      category: 'grocery_pos',
      title: 'Do your big shop at Aldi or Lidl',
      summary: 'Most of your grocery trips are to convenience stores, which charge more for the same basket.',
      current_monthly: Math.round((total(groceries) / asOfDay) * daysInMonth),
      save_min: 18,
      save_max: 26,
    },
    {
      id: 'takeaway',
      category: 'food_dining',
      title: 'Swap some takeaways for home cooking',
      summary: `${takeaways.length} Deliveroo and Uber Eats orders so far this month, averaging £${avg.toFixed(2)} each.`,
      current_monthly: Math.round((total(takeaways) / asOfDay) * daysInMonth),
      save_min: Math.round(3 * (avg - 2.5)),
      save_max: Math.round(5 * (avg - 2.5)),
    },
    {
      id: 'streaming',
      category: 'entertainment',
      title: 'Cut your streaming bill',
      summary: 'You pay for Netflix and Disney+: £20.98 a month for two video services.',
      current_monthly: 20.98,
      save_min: 5,
      save_max: 10,
    },
  ]

  return {
    month: {
      label: 'November 2026',
      days_in_month: daysInMonth,
      days_left: daysInMonth - asOfDay,
      budget: BUDGET,
      spent,
      projected: Math.round(at(daysInMonth)),
      projected_low: forecast[daysInMonth - 1].low!,
      projected_high: forecast[daysInMonth - 1].high!,
      last_month_total: total(lastMonth),
    },
    forecast,
    subscriptions,
    savings,
  }
}

// ── PLACEHOLDER model output (only used when the backend is offline) ───────
// Same SHAPE and same maths as ml/model.py, but the 20 "neighbours" are made up.

function sharesOf(rows: StatementRow[]): Record<Category, number> {
  const sums = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>
  for (const r of rows) sums[r.category] += r.amt
  const all = Object.values(sums).reduce((a, b) => a + b, 0) || 1
  return Object.fromEntries(CATEGORIES.map((c) => [c, sums[c] / all])) as Record<Category, number>
}

/** Fake neighbour: Alex's mix with seeded noise, then re-normalised. */
export function mockNeighbourMix(ccNum: number, base: Record<Category, number> = sharesOf(demoRows())): Record<Category, number> {
  const rand = mulberry32(ccNum)
  const raw = CATEGORIES.map((c) => (base[c] + 0.015) * (0.5 + rand() * 0.9))
  const sum = raw.reduce((a, b) => a + b, 0)
  return Object.fromEntries(CATEGORIES.map((c, i) => [c, raw[i] / sum])) as Record<Category, number>
}

export function mockInsights(rows: StatementRow[]): Insights {
  const you = sharesOf(rows)
  const rand = mulberry32(7)
  const neighbours = Array.from({ length: 20 }, (_, i) => ({
    cc_num: 900_000 + i,
    similarity: round2(0.42 - i * 0.012 - rand() * 0.01),
  }))
  const mixes = neighbours.map((n) => mockNeighbourMix(n.cc_num, you))
  const nb = Object.fromEntries(CATEGORIES.map((c) => [c, mixes.reduce((s, m) => s + m[c], 0) / mixes.length])) as Record<
    Category,
    number
  >
  const days = (Date.parse(AS_OF) - Date.parse(START)) / 864e5
  const monthly = rows.reduce((s, r) => s + r.amt, 0) / Math.max(1, days / 30.44)
  const gap = (c: Category) => you[c] - nb[c]
  const label = (c: Category) => CATEGORY[c].label

  return {
    cc_num: 0,
    segment: { id: 2, name: 'More than most on Eating out & Entertainment', size: 181 },
    score: Math.round(100 * (1 - CATEGORIES.reduce((s, c) => s + Math.max(0, gap(c)), 0))),
    monthly_spend: round2(monthly),
    neighbours,
    categories: [...CATEGORIES]
      .sort((a, b) => gap(b) - gap(a))
      .map((c) => ({ category: c, label: label(c), your_share: you[c], neighbours_share: nb[c], segment_share: nb[c] })),
    recommendations: [...CATEGORIES]
      .filter((c) => gap(c) > 0.03)
      .sort((a, b) => gap(b) - gap(a))
      .slice(0, 3)
      .map((c) => ({
        category: c,
        label: label(c),
        your_share: you[c],
        neighbours_share: nb[c],
        est_monthly_saving: round2(monthly * gap(c)),
        message: `You spend ${Math.round(you[c] * 100)}% of your money on ${label(c)}; your 20 most similar users spend ${Math.round(nb[c] * 100)}%.`,
      })),
  }
}
