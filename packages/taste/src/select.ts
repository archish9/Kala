import { briefToAxes } from './axes.js'
import {
  AXIS_NAMES, type Axes, type AxisName, type AxisRange, type DesignSystem, type Proposal,
  type CatalogStyle, type CatalogPalette, type CatalogTypography
} from './types.js'

/** 0 when inside the range; otherwise the gap to the nearest edge. */
const gap = (v: number, [lo, hi]: AxisRange): number =>
  v < lo ? lo - v : v > hi ? v - hi : 0

export type Scoreable = {
  id: string
  axes: Record<AxisName, AxisRange>
  fitFor: string[]
  avoidFor: string[]
}

export const axisDistance = (axes: Axes, item: Scoreable): number => {
  let sum = 0
  for (const axis of AXIS_NAMES) sum += gap(axes[axis], item.axes[axis]) ** 2
  return Math.sqrt(sum)
}

const domainHits = (text: string, terms: string[]): string[] =>
  terms.filter(t => text.includes(t.toLowerCase()))

export type Scored<T> = { item: T; fit: number; fitHits: string[]; avoidHits: string[] }

/**
 * Geometry first, then domain evidence. A named domain match is worth more
 * than a small vector advantage, because the brief said it out loud. Shared
 * by the 12 curated systems and every catalog pool (styles/palettes/typography)
 * so there is exactly one scoring algorithm in the codebase.
 */
export const scorePool = <T extends Scoreable>(brief: string, pool: T[]): Scored<T>[] => {
  const { axes } = briefToAxes(brief)
  const lower = brief.toLowerCase()

  const scored = pool.map(item => {
    const fitHits = domainHits(lower, item.fitFor)
    const avoidHits = domainHits(lower, item.avoidFor)
    const distance = axisDistance(axes, item)
    const raw = 1 - Math.min(1, distance)
    const adjusted = raw + fitHits.length * 0.12 - avoidHits.length * 0.30
    return {
      item,
      fit: Math.round(Math.min(1, Math.max(0, adjusted)) * 100) / 100,
      fitHits, avoidHits
    }
  })

  // Ties break on id so the same brief always yields the same order.
  scored.sort((a, b) => b.fit - a.fit || a.item.id.localeCompare(b.item.id))
  return scored
}

const describeSystemFit = (
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
): Proposal[] =>
  scorePool(brief, systems).slice(0, limit).map(({ item, fit, fitHits, avoidHits }) => ({
    system: item, fit, rationale: describeSystemFit(item, fitHits, avoidHits)
  }))

const describeStyleFit = (
  style: CatalogStyle, fitHits: string[], avoidHits: string[]
): string => {
  if (avoidHits.length > 0) {
    return `${style.color.strategy}; explicitly not intended for ${avoidHits.join(', ')}`
  }
  if (fitHits.length > 0) {
    return `${style.color.strategy}; built for ${fitHits.join(', ')}`
  }
  return style.color.strategy
}

export const selectCatalogStyles = (
  brief: string, pool: CatalogStyle[], limit = 3
): { style: CatalogStyle; fit: number; rationale: string }[] =>
  scorePool(brief, pool).slice(0, limit).map(({ item, fit, fitHits, avoidHits }) => ({
    style: item, fit, rationale: describeStyleFit(item, fitHits, avoidHits)
  }))

export const selectCatalogPalettes = (
  brief: string, pool: CatalogPalette[], mode: 'light' | 'dark', limit = 3
): { palette: CatalogPalette; fit: number }[] => {
  const filtered = pool.filter(p => mode === 'dark' ? p.darkPrimary : !p.darkPrimary)
  const candidates = filtered.length > 0 ? filtered : pool
  return scorePool(brief, candidates).slice(0, limit).map(({ item, fit }) => ({
    palette: item, fit
  }))
}

export const selectCatalogTypography = (
  brief: string, pool: CatalogTypography[], limit = 3
): { typography: CatalogTypography; fit: number }[] =>
  scorePool(brief, pool).slice(0, limit).map(({ item, fit }) => ({
    typography: item, fit
  }))
