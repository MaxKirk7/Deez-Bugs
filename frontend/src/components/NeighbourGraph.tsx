import { LoaderCircle, Network } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { neighbourMix } from '../api'
import { CATEGORIES, CATEGORY } from '../lib/categories'
import { groupName, pct } from '../lib/format'
import type { Category, Dashboard } from '../types'
import { Card, CardHeader, SourceTag } from './ui'

const W = 640
const H = 440
const CX = W / 2
const CY = H / 2

/**
 * Obsidian-style graph: you in the middle, your 20 most similar people (KNN) around you.
 * Closer + bigger = more similar. Hover or focus a dot to load that person's real mix.
 */
export function NeighbourGraph({ data }: { data: Dashboard }) {
  const { neighbours, segment } = data.insights
  const live = data.mode === 'live'
  const reduced = useReducedMotion()
  const [active, setActive] = useState<number | null>(null)

  const nodes = useMemo(() => {
    const sims = neighbours.map((n) => n.similarity)
    const lo = Math.min(...sims)
    const hi = Math.max(...sims)
    return neighbours.map((n, i) => {
      const t = hi === lo ? 0.5 : (hi - n.similarity) / (hi - lo) // 0 = most similar
      const angle = i * 2.39996 // golden angle: spreads dots evenly without a grid look
      const radius = 95 + t * 105
      return {
        ...n,
        i,
        x: CX + Math.cos(angle) * radius * 1.35,
        y: CY + Math.sin(angle) * radius * 0.92,
        size: 9 - t * 4,
        strength: 1 - t,
      }
    })
  }, [neighbours])

  const current = active === null ? null : nodes[active]

  return (
    <Card delay={0.15} className="flex h-full flex-col">
      <CardHeader
        icon={Network}
        title="People like you"
        subtitle={`Your ${neighbours.length} most similar people out of 908. Hover a dot.`}
        action={<SourceTag kind={live ? 'live' : 'placeholder'} />}
      />

      <div className="relative flex-1 px-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-full max-h-[440px] w-full"
          role="group"
          aria-label="Graph of your most similar people"
        >
          <defs>
            <radialGradient id="you-glow">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* distance guides */}
          {[110, 170].map((r) => (
            <ellipse key={r} cx={CX} cy={CY} rx={r * 1.35} ry={r * 0.92} fill="none" stroke="var(--line)" strokeDasharray="2 6" />
          ))}
          {/* links: you → each neighbour; stronger = more similar */}
          {nodes.map((n) => (
            <line
              key={`l${n.cc_num}`}
              x1={CX}
              y1={CY}
              x2={n.x}
              y2={n.y}
              stroke={active === n.i ? 'var(--brand)' : 'var(--ink-2)'}
              strokeOpacity={active === n.i ? 0.9 : 0.08 + n.strength * 0.22}
              strokeWidth={active === n.i ? 1.5 : 1}
            />
          ))}
          {/* neighbours */}
          {nodes.map((n) => (
            <motion.g
              key={n.cc_num}
              animate={reduced ? undefined : { x: [0, 3, -2, 0], y: [0, -3, 2, 0] }}
              transition={{
                duration: 6 + (n.i % 5),
                repeat: Infinity,
                ease: 'easeInOut',
                delay: n.i * 0.2,
              }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={18}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`Person ${n.i + 1}, similarity ${n.similarity}`}
                onMouseEnter={() => setActive(n.i)}
                onFocus={() => setActive(n.i)}
                onMouseLeave={() => setActive(null)}
                onBlur={() => setActive(null)}
                className="cursor-pointer outline-none"
              />
              <circle
                cx={n.x}
                cy={n.y}
                r={active === n.i ? n.size + 3 : n.size}
                fill={active === n.i ? 'var(--violet)' : 'var(--ink-2)'}
                fillOpacity={active === n.i ? 1 : 0.35 + n.strength * 0.5}
                stroke="var(--surface-solid)"
                strokeWidth={2}
                className="pointer-events-none transition-all duration-200"
                style={active === n.i ? { filter: 'drop-shadow(0 0 8px var(--violet))' } : undefined}
              />
            </motion.g>
          ))}
          {/* you */}
          <circle cx={CX} cy={CY} r={48} fill="url(#you-glow)" />
          <circle cx={CX} cy={CY} r={15} fill="var(--brand)" stroke="var(--surface-solid)" strokeWidth={3} />
          <text x={CX} y={CY + 36} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--ink)">
            You
          </text>
        </svg>

        {current && <HoverCard node={current} live={live} you={data.insights.categories} />}
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-5 pb-5 text-xs text-muted sm:px-6">
        <p>
          Your group: <span className="text-ink-2">{groupName(segment.name)}</span> · {segment.size} people
        </p>
        <p>Closer and bigger dots spend more like you</p>
      </div>
    </Card>
  )
}

function HoverCard({
  node,
  live,
  you,
}: {
  node: { cc_num: number; similarity: number; i: number; x: number; y: number }
  live: boolean
  you: Dashboard['insights']['categories']
}) {
  const [mix, setMix] = useState<Record<Category, number> | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let on = true
    neighbourMix(node.cc_num, live)
      .then((m) => on && setMix(m))
      .catch(() => on && setFailed(true))
    return () => {
      on = false
    }
  }, [node.cc_num, live])

  const top = mix ? [...CATEGORIES].sort((a, b) => mix[b] - mix[a]).slice(0, 3) : []
  const yours = Object.fromEntries(you.map((c) => [c.category, c.your_share]))
  // keep the card inside the box: flip to the left of the dot on the right half
  const left = `${(node.x / W) * 100}%`
  const flip = node.x > W / 2

  return (
    <div
      className="pointer-events-none absolute z-10 w-56"
      style={{
        left,
        top: `${(node.y / H) * 100}%`,
        transform: `translate(${flip ? 'calc(-100% - 16px)' : '16px'}, -50%)`,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-line bg-surface-solid/95 p-3.5 text-xs shadow-card backdrop-blur-xl"
      >
        <p className="flex items-center justify-between font-semibold text-ink">
          Person {node.i + 1}
          <span className="tabular font-normal text-muted">similarity {node.similarity.toFixed(2)}</span>
        </p>
        <p className="mt-2 text-[11px] font-medium text-muted">Their top spending (you)</p>
        {mix ? (
          <ul className="mt-1 space-y-1">
            {top.map((c) => (
              <li key={c} className="flex justify-between gap-2">
                <span className="truncate text-ink-2">{CATEGORY[c].label}</span>
                <span className="tabular text-ink">
                  {pct(mix[c])} <span className="text-muted">({pct(yours[c] ?? 0)})</span>
                </span>
              </li>
            ))}
          </ul>
        ) : failed ? (
          <p className="mt-1 text-muted">Couldn’t load their mix.</p>
        ) : (
          <p className="mt-1 inline-flex items-center gap-1.5 text-muted">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Loading from the database…
          </p>
        )}
      </motion.div>
    </div>
  )
}
