import { briefToAxes } from './axes.js'
import { AXIS_NAMES, type Axes, type DesignSystem, type Proposal } from './types.js'

/** 0 when inside the range; otherwise the gap to the nearest edge. */
const gap = (v: number, [lo, hi]: [number, number]): number =>
  v < lo ? lo - v : v > hi ? v - hi : 0

export const axisDistance = (axes: Axes, system: DesignSystem): number => {
  let sum = 0
  for (const axis of AXIS_NAMES) sum += gap(axes[axis], system.axes[axis]) ** 2
  return Math.sqrt(sum)
}

const domainHits = (text: string, terms: string[]): string[] =>
  terms.filter(t => text.includes(t.toLowerCase()))

const describeFit = (
  system: DesignSystem, fitHits: string[], avoidHits: string[]
): string => {
  if (avoidHits.length > 0) {
    return `${system.color.strategy}; explicitly not intended for ${avoidHits.join(', ')}`
  }
  if (fitHits.length > 0) {
    return `${system.color.strategy}; built for ${fitHits.join(', ')}`
  }
  return `${system.color.strategy}; ${system.signature[0] ?? ''}`.trim()
}

export const selectSystems = (
  brief: string, systems: DesignSystem[], limit = 3
): Proposal[] => {
  const { axes } = briefToAxes(brief)
  const lower = brief.toLowerCase()

  const scored = systems.map(system => {
    const fitHits = domainHits(lower, system.fitFor)
    const avoidHits = domainHits(lower, system.avoidFor)

    // Geometry first, then domain evidence. A named domain match is worth more
    // than a small vector advantage, because the brief said it out loud.
    const distance = axisDistance(axes, system)
    const raw = 1 - Math.min(1, distance)
    const adjusted = raw + fitHits.length * 0.12 - avoidHits.length * 0.30

    return {
      system,
      fit: Math.round(Math.min(1, Math.max(0, adjusted)) * 100) / 100,
      rationale: describeFit(system, fitHits, avoidHits)
    }
  })

  // Ties break on id so the same brief always yields the same order.
  scored.sort((a, b) => b.fit - a.fit || a.system.id.localeCompare(b.system.id))
  return scored.slice(0, limit)
}
