import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Car, Footprints, House, LoaderCircle, MapPin, Route } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY } from '../lib/categories'
import { money } from '../lib/format'
import type { Area, Dashboard, Places } from '../types'
import { Card, CardHeader, SourceTag } from './ui'

/**
 * "Where you spend": a map of the user's purchases.
 *   circle size   = how many times they bought there
 *   circle colour = money spent there (darker = more)
 *   dashed lines  = straight line from home, with km
 *   click a circle → real road route from home (free OSRM route service) + drive / walk time
 * Data: GET /users/{cc_num}/places (live) or built from the statement (demo).
 */

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const SCALE = ['#c9dcef', '#93bde3', '#5c9bd5', '#2f6fb5', '#22357e'] // light → dark = less → more money
const LINE = '#22357e'
const ROUTE = '#e8590c'
const WALK_KMH = 5

type RouteState =
  | { status: 'loading' }
  | { status: 'ok'; km: number; minutes: number; path: [number, number][] }
  | { status: 'error' }

type SavedPin = { lat: number; long: number }

const PINS_KEY = 'penny.mapPin.v1'
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const km = (n: number) => (n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(n < 10 ? 1 : 0)} km`)
const radius = (visits: number) => Math.min(9 + Math.sqrt(visits) * 3, 34)
const areaName = (a: Area) => a.shops[0].merchant + (a.shops.length > 1 ? ` +${a.shops.length - 1}` : '')
const formatCoordinate = (value: number) => value.toFixed(5)

function readPin(): SavedPin | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PINS_KEY) ?? 'null')
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof value.lat === 'number' &&
      typeof value.long === 'number'
    ) {
      return { lat: value.lat, long: value.long }
    }
    return null
  } catch {
    return null
  }
}

/** Real road route from the free OSRM demo server (car profile). */
async function fetchRoute(from: { lat: number; long: number }, to: Area, signal: AbortSignal): Promise<RouteState> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.long},${from.lat};${to.long},${to.lat}?overview=full&geometries=geojson`
  const res = await fetch(url, { signal })
  if (!res.ok) return { status: 'error' }
  const body = await res.json()
  const r = body.routes?.[0]
  if (!r) return { status: 'error' }
  return {
    status: 'ok',
    km: r.distance / 1000,
    minutes: r.duration / 60,
    path: (r.geometry.coordinates as [number, number][]).map(([lon, lat]) => [lat, lon]),
  }
}

export function SpendingMap({ data }: { data: Dashboard }) {
  const { places, currency } = data
  const live = data.mode === 'live'
  const [selected, setSelected] = useState<number | null>(null)
  const [routes, setRoutes] = useState<Record<number, RouteState>>({})
  const [pin, setPin] = useState<SavedPin | null>(readPin)
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const pinRef = useRef(pin)
  pinRef.current = pin

  const area = places.areas.find((a) => a.id === selected) ?? null
  const colour = useMemo(() => {
    const spends = places.areas.map((a) => a.spend)
    const lo = Math.min(...spends)
    const hi = Math.max(...spends)
    return (spend: number) => SCALE[hi === lo ? 2 : Math.min(SCALE.length - 1, Math.floor(((spend - lo) / (hi - lo)) * SCALE.length))]
  }, [places])

  // Create the map once.
  useEffect(() => {
    if (!el.current) return
    // No attribution badge on the map: the OpenStreetMap credit is shown in the legend below instead.
    const m = L.map(el.current, { zoomControl: false, zoomSnap: 0.25, scrollWheelZoom: false, attributionControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    L.tileLayer(TILES, { maxZoom: 18 }).addTo(m)
    const points = places.areas.map((a) => L.latLng(a.lat, a.long))
    if (places.home) points.push(L.latLng(places.home.lat, places.home.long))
    if (pinRef.current) points.push(L.latLng(pinRef.current.lat, pinRef.current.long))
    if (points.length) m.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 })
    else m.setView([20, 0], 2)
    m.on('click', (event) => {
      setSelected(null)
      setPin({ lat: event.latlng.lat, long: event.latlng.lng })
    })
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [places])

  useEffect(() => {
    try {
      if (pin) localStorage.setItem(PINS_KEY, JSON.stringify(pin))
      else localStorage.removeItem(PINS_KEY)
    } catch {
      // Persistence is best effort when browser storage is unavailable.
    }
  }, [pin])

  // Fetch the road route when a circle is picked (once per area).
  useEffect(() => {
    if (!area || !places.home || routes[area.id]) return
    const ctrl = new AbortController()
    setRoutes((r) => ({ ...r, [area.id]: { status: 'loading' } }))
    fetchRoute(places.home, area, ctrl.signal)
      .catch(() => ({ status: 'error' }) as RouteState)
      .then((state) => {
        if (!ctrl.signal.aborted) setRoutes((r) => ({ ...r, [area.id]: state }))
      })
    return () => {
      ctrl.abort()
      setRoutes((r) => (r[area.id]?.status === 'loading' ? Object.fromEntries(Object.entries(r).filter(([k]) => Number(k) !== area.id)) : r))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area?.id, places.home])

  // Draw home, lines, circles and the picked route.
  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    const home = places.home
    const route = selected === null ? undefined : routes[selected]

    for (const a of places.areas) {
      if (home && !(a.id === selected && route?.status === 'ok')) {
        L.polyline([[home.lat, home.long], [a.lat, a.long]], {
          color: LINE,
          weight: a.id === selected ? 2.5 : 1.5,
          opacity: a.id === selected ? 0.8 : 0.35,
          dashArray: '3 7',
          lineCap: 'round',
          interactive: false,
        }).addTo(g)
      }
    }
    if (route?.status === 'ok') {
      L.polyline(route.path, { color: ROUTE, weight: 5, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(g)
    }
    for (const a of [...places.areas].sort((x, y) => y.visits - x.visits)) {
      const isSel = a.id === selected
      const tip = `<b>${esc(areaName(a))}</b> · ${a.visits} visit${a.visits === 1 ? '' : 's'} · ${money(a.spend, currency)}${
        a.km_from_home == null ? '' : ` · ${km(a.km_from_home)} from home`
      }`
      L.circleMarker([a.lat, a.long], {
        radius: radius(a.visits),
        color: isSel ? LINE : '#ffffff',
        weight: isSel ? 4 : 2,
        fillColor: colour(a.spend),
        fillOpacity: 0.88,
        className: 'map-area',
      })
        .bindTooltip(tip, { direction: 'top', offset: [0, -6] })
        .on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          setSelected(a.id)
        })
        .addTo(g)
      L.marker([a.lat, a.long], {
        icon: L.divIcon({ className: 'map-label', html: `<span>${a.visits}</span>`, iconSize: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(g)
    }
    if (home) {
      L.marker([home.lat, home.long], {
        icon: L.divIcon({ className: 'map-home', html: '<span>⌂ Home</span>', iconSize: [0, 0] }),
        keyboard: false,
        zIndexOffset: 1000,
        title: home.city ? `Home, ${home.city}` : 'Home',
      }).addTo(g)
    }
    if (pin) {
      L.marker([pin.lat, pin.long], {
        icon: L.divIcon({ className: 'map-pin', html: '<span>●</span>', iconSize: [14, 14], iconAnchor: [7, 7] }),
        title: `Saved pin: ${formatCoordinate(pin.lat)}, ${formatCoordinate(pin.long)}`,
      })
        .bindTooltip(`Saved pin · ${formatCoordinate(pin.lat)}, ${formatCoordinate(pin.long)}`, { direction: 'top', offset: [0, -8] })
        .addTo(g)
    }
  }, [places, selected, routes, colour, currency, pin])

  return (
    <Card delay={0.1} className="flex flex-col">
      <CardHeader
        icon={MapPin}
        title="Where you spend"
        subtitle="Click anywhere on the map to save a latitude/longitude pin."
        action={<SourceTag kind={live ? 'live' : 'placeholder'} />}
      />
      <div className="spend-map relative m-5 mb-3 h-[380px] overflow-hidden rounded-2xl border border-line sm:m-6 sm:mb-3 sm:h-[420px]">
        <div ref={el} className="absolute inset-0" />
      </div>
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        {places.areas.length === 0 && <p className="mb-3 text-sm text-muted">No spending locations are available, but you can still drop and save pins.</p>}
        {pin && (
          <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-sm tabular text-muted">
            Saved pin: {formatCoordinate(pin.lat)}, {formatCoordinate(pin.long)}
          </p>
        )}
        {places.areas.length > 0 && (
          <>
            {area ? <AreaDetails area={area} places={places} route={routes[area.id]} currency={currency} /> : <Summary places={places} currency={currency} />}
            <Legend places={places} currency={currency} />
          </>
        )}
      </div>
    </Card>
  )
}

function Summary({ places, currency }: { places: Places; currency: Dashboard['currency'] }) {
  const withKm = places.areas.filter((a) => a.km_from_home != null)
  const furthest = withKm.reduce<Area | null>((f, a) => (f === null || a.km_from_home! > f.km_from_home! ? a : f), null)
  const nearVisits = withKm.filter((a) => a.km_from_home! <= 2).reduce((s, a) => s + a.visits, 0)
  const favourite = places.areas[0]
  return (
    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <Stat label="Places" value={String(places.areas.length)} />
      <Stat label="Favourite" value={areaName(favourite)} note={`${favourite.visits} visits · ${money(favourite.spend, currency)}`} />
      {furthest ? (
        <Stat label="Furthest trip" value={km(furthest.km_from_home!)} note={areaName(furthest)} />
      ) : (
        <Stat label="Home" value="Unknown" note="add lat / long columns" />
      )}
      <Stat
        label={places.home ? 'Within 2 km of home' : 'Online / no place'}
        value={places.home ? `${Math.round((nearVisits / Math.max(1, places.located_purchases)) * 100)}%` : String(places.online_purchases)}
        note={places.home ? `${places.online_purchases} online, not on the map` : 'not on the map'}
      />
    </div>
  )
}

function AreaDetails({ area, places, route, currency }: { area: Area; places: Places; route?: RouteState; currency: Dashboard['currency'] }) {
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="font-semibold text-ink">{areaName(area)}</p>
        <p className="text-muted">
          {area.visits} visits · {money(area.spend, currency)} · mostly {CATEGORY[area.top_category]?.label ?? area.top_category}
        </p>
        {area.shops.length > 1 && (
          <ul className="mt-1 text-xs text-muted">
            {area.shops.map((s) => (
              <li key={s.merchant}>
                {s.merchant}: {s.visits}× · {money(s.spend, currency)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl bg-surface-2 p-3">
        {!places.home ? (
          <p className="text-muted">Add your home (lat / long columns) to see the route.</p>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-muted">
              <House className="size-3.5" aria-hidden /> {km(area.km_from_home ?? 0)} from home in a straight line
            </p>
            {route?.status === 'loading' && (
              <p className="mt-1 flex items-center gap-1.5 text-muted">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Finding the road route…
              </p>
            )}
            {route?.status === 'ok' && (
              <div className="mt-1 space-y-0.5 text-ink">
                <p className="flex items-center gap-1.5">
                  <Route className="size-3.5" aria-hidden style={{ color: ROUTE }} /> {km(route.km)} by road
                </p>
                <p className="flex items-center gap-1.5">
                  <Car className="size-3.5" aria-hidden /> about {Math.max(1, Math.round(route.minutes))} min drive
                </p>
                <p className="flex items-center gap-1.5">
                  <Footprints className="size-3.5" aria-hidden /> about {Math.max(1, Math.round((route.km / WALK_KMH) * 60))} min walk
                </p>
              </div>
            )}
            {route?.status === 'error' && <p className="mt-1 text-muted">Road route unavailable (needs internet).</p>}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="truncate font-semibold text-ink">{value}</p>
      {note && <p className="truncate text-xs text-muted">{note}</p>}
    </div>
  )
}

function Legend({ places, currency }: { places: Places; currency: Dashboard['currency'] }) {
  const spends = places.areas.map((a) => a.spend)
  return (
    <div className="mt-4 text-xs text-muted">
      <p>Circle size = times you bought there · number = visits · darker = more money spent</p>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full">
        {SCALE.map((c) => (
          <span key={c} className="flex-1" style={{ background: c }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between tabular">
        <span>{money(Math.min(...spends), currency)}</span>
        <span>{money(Math.max(...spends), currency)}</span>
      </div>
      {/* Required by the OpenStreetMap licence (shown here instead of a badge on the map). */}
      <p className="mt-2 text-[10px] opacity-70">
        Map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
          OpenStreetMap
        </a>{' '}
        contributors · routes by OSRM
      </p>
    </div>
  )
}
