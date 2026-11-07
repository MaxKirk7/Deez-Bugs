/**
 * Map helpers.
 *  kmBetween()       straight-line distance in km
 *  placesFromRows()  DEMO MODE ONLY: builds the map data from the statement in the browser
 *                    (one circle per shop). In live mode the backend's
 *                    GET /users/{cc_num}/places does this with real area grouping.
 */
import type { Area, Category, Places, StatementRow } from '../types'

export function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

const located = (r: StatementRow) => r.merch_lat != null && r.merch_long != null

export function placesFromRows(rows: StatementRow[]): Places {
  const homeRow = rows.find((r) => r.lat != null && r.long != null)
  const home = homeRow ? { lat: homeRow.lat!, long: homeRow.long!, city: homeRow.city ?? null } : null

  const byShop = new Map<string, StatementRow[]>()
  for (const r of rows.filter(located)) byShop.set(r.merchant, [...(byShop.get(r.merchant) ?? []), r])

  const areas: Area[] = [...byShop.entries()].map(([merchant, rs], id) => {
    const lat = rs.reduce((s, r) => s + r.merch_lat!, 0) / rs.length
    const long = rs.reduce((s, r) => s + r.merch_long!, 0) / rs.length
    const spend = Math.round(rs.reduce((s, r) => s + r.amt, 0) * 100) / 100
    return {
      id,
      lat,
      long,
      visits: rs.length,
      spend,
      top_category: rs[0].category as Category,
      shops: [{ merchant, visits: rs.length, spend }],
      km_from_home: home ? Math.round(kmBetween(home.lat, home.long, lat, long) * 100) / 100 : null,
    }
  })
  areas.sort((a, b) => b.visits - a.visits)
  const locatedCount = areas.reduce((s, a) => s + a.visits, 0)
  return {
    cc_num: 0,
    home,
    areas,
    area_radius_km: 0,
    located_purchases: locatedCount,
    online_purchases: rows.length - locatedCount,
  }
}
