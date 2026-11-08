/**
 * THE DATA CONTRACT.
 *
 * Part 1 mirrors the REAL backend exactly (src/deez_bugs/api/api.py + ml/model.py):
 *   POST /upload-csv/                → UploadResult
 *   GET  /users/{cc_num}/insights    → Insights
 *   GET  /users/{cc_num}/categories  → UserCategories
 *
 * Part 2 is the PLACEHOLDER preview (forecast, subscriptions, savings agent).
 * Not built in the backend yet: the UI always shows it with a PLACEHOLDER tag.
 */

// ── Part 1: real backend ────────────────────────────────────────────────

/** The 14 categories in the database (same as the Kaggle dataset). */
export type Category =
  | 'grocery_pos'
  | 'grocery_net'
  | 'food_dining'
  | 'gas_transport'
  | 'shopping_pos'
  | 'shopping_net'
  | 'home'
  | 'kids_pets'
  | 'entertainment'
  | 'personal_care'
  | 'health_fitness'
  | 'travel'
  | 'misc_pos'
  | 'misc_net'

/** One row of an uploaded CSV. The backend needs exactly these 4 columns. */
export interface StatementRow {
  trans_date_trans_time: string // "2026-11-19 12:30:00"
  merchant: string
  category: Category
  amt: number // money spent (positive)
  merch_lat?: number | null
  merch_long?: number | null
  lat?: number | null
  long?: number | null
  city?: string | null
}

export interface Area {
  id: number
  lat: number
  long: number
  visits: number
  spend: number
  top_category: Category
  shops: { merchant: string; visits: number; spend: number }[]
  km_from_home: number | null
}

export interface Places {
  cc_num: number
  home: { lat: number; long: number; city: string | null } | null
  areas: Area[]
  area_radius_km: number
  located_purchases: number
  online_purchases: number
}

export interface UploadResult {
  filename: string
  cc_num: number // the new user's ID
  rows_inserted: number
}

export interface CategoryShare {
  category: Category
  label: string
  your_share: number // 0..1
  neighbours_share: number // average of your 20 most similar people
  segment_share: number // average of your k-means group
}

export interface Recommendation {
  category: Category
  label: string
  your_share: number
  neighbours_share: number
  est_monthly_saving: number
  message: string
}

/** GET /users/{cc_num}/insights */
export interface Insights {
  cc_num: number
  segment: { id: number; name: string; size: number }
  score: number // 0..100: how much of your spending mix matches people like you
  monthly_spend: number
  neighbours: { cc_num: number; similarity: number }[]
  categories: CategoryShare[]
  recommendations: Recommendation[]
}

/** GET /users/{cc_num}/categories */
export interface UserCategories {
  cc_num: number
  categories: { category: Category; your_share: number; reference_avg_share: number }[]
}

// ── Part 2: PLACEHOLDER preview (not in the backend yet) ─────────────────

export interface ForecastPoint {
  day: number
  actual: number | null
  projected: number | null
  low: number | null
  high: number | null
  last_month: number | null
}

export interface MonthSummary {
  label: string
  days_in_month: number
  days_left: number
  budget: number
  spent: number
  projected: number
  projected_low: number
  projected_high: number
  last_month_total: number
}

export interface Subscription {
  merchant: string
  amount: number
  cadence: 'monthly' | 'yearly'
  next_date: string
  flag: { kind: 'price_rise' | 'duplicate'; message: string } | null
}

export interface SavingsOpportunity {
  id: string
  category: Category
  title: string
  summary: string
  current_monthly: number
  save_min: number
  save_max: number
}

export interface Preview {
  month: MonthSummary
  forecast: ForecastPoint[]
  subscriptions: Subscription[]
  savings: SavingsOpportunity[]
}

export interface AgentStep {
  kind: 'search' | 'visit' | 'compare' | 'done'
  text: string
  url?: string
}

export interface AgentResult {
  opportunity_id: string
  headline: string
  alternatives: { name: string; price: number; note: string; url?: string }[]
  current: { name: string; price: number }
  monthly_saving: number
}

// ── What the dashboard gets ─────────────────────────────────────────────

export type Currency = 'GBP' | 'USD'

export interface Dashboard {
  /** live = real model output from the backend; demo = placeholder model output (backend offline) */
  mode: 'live' | 'demo'
  currency: Currency
  user: { name: string }
  filename: string
  rows: StatementRow[] // the statement itself (read in the browser), for the heatmap
  insights: Insights
  places: Places
  preview: Preview // always PLACEHOLDER
}

export interface AssistantProfile {
  currency: Currency
  total_spend: number
  monthly_spend: Record<string, number>
  category_spend: Record<string, number>
  recommendations: Insights['recommendations']
}
